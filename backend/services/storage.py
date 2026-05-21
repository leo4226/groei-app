"""Object storage abstraction (Cloudflare R2 via S3-compatible boto3)."""

import os
import boto3
from botocore.client import Config


class Storage:
    def __init__(self, client, bucket: str, public_base_url: str) -> None:
        self._client = client
        self.bucket = bucket
        self.public_base_url = public_base_url.rstrip("/")

    def public_url(self, key: str) -> str:
        return f"{self.public_base_url}/{key.lstrip('/')}"

    def put(self, key: str, data: bytes, content_type: str) -> str:
        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return self.public_url(key)


def build_storage_from_env() -> Storage:
    account_id = os.environ["R2_ACCOUNT_ID"]
    access_key = os.environ["R2_ACCESS_KEY_ID"]
    secret_key = os.environ["R2_SECRET_ACCESS_KEY"]
    bucket = os.environ["R2_BUCKET"]
    public_base = os.environ["R2_PUBLIC_BASE_URL"]

    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    return Storage(client=client, bucket=bucket, public_base_url=public_base)
