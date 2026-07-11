// aws.mjs — ALL AWS SDK access lives here. index.mjs injects this as ctx into routes;
// tests inject fakes instead, so nothing else in the codebase imports the SDK.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";

const region = process.env.AWS_REGION || "eu-central-1";
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3c = new S3Client({ region });
const sqs = new SQSClient({ region });
const ssm = new SSMClient({ region });
const cf = new CloudFrontClient({ region: "us-east-1" });

const TABLE = process.env.TABLE_NAME;

export const ddb = {
  get: (Key) => doc.send(new GetCommand({ TableName: TABLE, Key })).then((r) => r.Item || null),
  put: (Item, condition) =>
    doc.send(new PutCommand({ TableName: TABLE, Item, ...(condition ? { ConditionExpression: condition } : {}) })),
  update: (params) => doc.send(new UpdateCommand({ TableName: TABLE, ...params })).then((r) => r.Attributes),
  del: (Key) => doc.send(new DeleteCommand({ TableName: TABLE, Key })),
  query: (params) => doc.send(new QueryCommand({ TableName: TABLE, ...params })).then((r) => r.Items || []),
  // paginated scan for the admin surfaces. Correct at demand-test scale
  // (hundreds of rows); past ~10k items, move the callers to a type-overloaded GSI.
  scan: (params) => doc.send(new ScanCommand({ TableName: TABLE, ...params }))
    .then((r) => ({ items: r.Items || [], lastKey: r.LastEvaluatedKey || null })),
};

export const s3 = {
  putObject: (Bucket, Key, Body, ContentType = "text/html; charset=utf-8") =>
    s3c.send(new PutObjectCommand({ Bucket, Key, Body, ContentType })),
  getObjectText: async (Bucket, Key) => {
    const r = await s3c.send(new GetObjectCommand({ Bucket, Key }));
    return r.Body.transformToString();
  },
  getObjectBytes: async (Bucket, Key) => {
    const r = await s3c.send(new GetObjectCommand({ Bucket, Key }));
    return Buffer.from(await r.Body.transformToByteArray());
  },
  copyObject: (Bucket, fromKey, toKey) =>
    s3c.send(new CopyObjectCommand({ Bucket, CopySource: `${Bucket}/${encodeURIComponent(fromKey)}`, Key: toKey })),
  // cross-bucket byte-for-byte copy: how a cut's images and video reach the
  // published release. SSE is pinned to AES256: CloudFront OAC cannot decrypt
  // KMS objects, and the source bucket (artifacts) is KMS-encrypted.
  copyObjectAcross: (fromBucket, fromKey, toBucket, toKey) =>
    s3c.send(new CopyObjectCommand({
      Bucket: toBucket, CopySource: `${fromBucket}/${encodeURIComponent(fromKey)}`, Key: toKey,
      ServerSideEncryption: "AES256", MetadataDirective: "COPY",
    })),
  deleteObject: (Bucket, Key) => s3c.send(new DeleteObjectCommand({ Bucket, Key })),
  listPrefix: async (Bucket, Prefix) => {
    const out = []; let ContinuationToken;
    do {
      const r = await s3c.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken, MaxKeys: 1000 }));
      for (const o of r.Contents || []) out.push({ key: o.Key, bytes: o.Size, at: o.LastModified });
      ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return out;
  },
};

export const presign = {
  async put(Bucket, Key, ContentType) {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { PutObjectCommand: POC } = await import("@aws-sdk/client-s3");
    return getSignedUrl(s3c, new POC({ Bucket, Key, ContentType }), { expiresIn: 900 });
  },
};

export const queue = {
  send: (QueueUrl, payload) =>
    sqs.send(new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify(payload) })),
};

// ---- CloudFront KVS (pointer flips). SigV4a support in the bundled SDK is the one
// runtime unknown, so callers treat any throw here as "use the S3-copy fallback".
export const kvs = {
  async put(kvsArn, key, value) {
    const { CloudFrontKeyValueStoreClient, DescribeKeyValueStoreCommand, PutKeyCommand } = await import(
      "@aws-sdk/client-cloudfront-keyvaluestore"
    );
    const c = new CloudFrontKeyValueStoreClient({ region: "us-east-1" });
    const d = await c.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
    await c.send(new PutKeyCommand({ KvsARN: kvsArn, IfMatch: d.ETag, Key: key, Value: value }));
  },
  async del(kvsArn, key) {
    const { CloudFrontKeyValueStoreClient, DescribeKeyValueStoreCommand, DeleteKeyCommand } = await import(
      "@aws-sdk/client-cloudfront-keyvaluestore"
    );
    const c = new CloudFrontKeyValueStoreClient({ region: "us-east-1" });
    const d = await c.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
    await c.send(new DeleteKeyCommand({ KvsARN: kvsArn, IfMatch: d.ETag, Key: key }));
  },
};

// ---- SES v2 (transactional email; dynamic import keeps cold starts lean)
// opts.replyTo lets studio-inbox notifications carry the visitor's address, so
// a plain reply in the mailbox goes to the visitor, not back to the sender.
// opts.text ships a plaintext alternative part (better filter scores). When
// SES_CONFIG_SET is set (phase 2), every send reports bounces and complaints.
export const ses = {
  async send(from, to, subject, html, opts = {}) {
    const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
    const c = new SESv2Client({ region });
    const configSet = process.env.SES_CONFIG_SET || "";
    await c.send(new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ...(opts.replyTo ? { ReplyToAddresses: [opts.replyTo] } : {}),
      ...(configSet ? { ConfigurationSetName: configSet } : {}),
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: { Html: { Data: html }, ...(opts.text ? { Text: { Data: opts.text } } : {}) },
        },
      },
    }));
  },
};

// ---- Step Functions task-token resume (callback -> pipeline)
export const sfn = {
  async sendTaskSuccess(taskToken, output) {
    const { SFNClient, SendTaskSuccessCommand } = await import("@aws-sdk/client-sfn");
    const c = new SFNClient({ region });
    await c.send(new SendTaskSuccessCommand({ taskToken, output: JSON.stringify(output) }));
  },
};

export const cdn = {
  invalidate: (distributionId, paths) =>
    cf.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: { CallerReference: `api-${Date.now()}`, Paths: { Quantity: paths.length, Items: paths } },
      })
    ),
};

// ---- live SSM parameter access (the Floor's kill switch). Unlike secrets()
// below, these reads are NOT cached: a breaker flip must be visible on the
// next admin poll. put() preserves the parameter's existing type.
export const params = {
  async get(name) {
    const { GetParameterCommand } = await import("@aws-sdk/client-ssm");
    try {
      const r = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
      return { value: r.Parameter?.Value ?? null, type: r.Parameter?.Type || null };
    } catch (e) {
      if (e?.name === "ParameterNotFound") return { value: null, type: null };
      throw e;
    }
  },
  async put(name, value, existingType) {
    const { PutParameterCommand } = await import("@aws-sdk/client-ssm");
    await ssm.send(new PutParameterCommand({ Name: name, Value: value, Type: existingType || "SecureString", Overwrite: true }));
  },
};

// ---- secrets: read once per container from SSM /cinefolio/{env}/*
let secretsCache = null;
export async function secrets() {
  if (secretsCache) return secretsCache;
  const Path = process.env.SSM_PREFIX || "/cinefolio/dev";
  const out = {};
  try {
    let NextToken;
    do {
      const r = await ssm.send(new GetParametersByPathCommand({ Path, WithDecryption: true, NextToken }));
      for (const p of r.Parameters || []) out[p.Name.split("/").pop()] = p.Value;
      NextToken = r.NextToken;
    } while (NextToken);
  } catch {
    /* no secrets configured yet -> degraded mode, handlers cope */
  }
  secretsCache = out;
  return out;
}

export const fetchFn = globalThis.fetch;
