## Local run (via `sam` tool).

event.json file must exist contain valid values, like in .env  
(see event.json.example)

```
sam local invoke MigrateFromTestrail -e event.json
```

---

## Pre-configure before deploy to real lambda
```
aws configure
aws iam create-role --role-name lambda-exec-role --assume-role-policy-document '{"Version": "2012-10-17","Statement": [{ "Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name lambda-exec-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

## First Build (very simplified)

```
npm install
```

## Get account ID (for the next step)

```
aws sts get-caller-identity
```

## First deploy
We need then to push an empty archive first, to not exceed the size limit.
```
zip -r function.zip README-lambda.md

aws lambda create-function --function-name migrate-testrail \
    --zip-file fileb://function.zip --handler lambda.handler --runtime nodejs18.x \
    --role arn:aws:iam::{ACCOUNT-ID}:role/lambda-exec-role
```

## Tune Lambda options for the first run

```
aws lambda update-function-configuration \
    --function-name migrate-testrail \
    --handler lambda.handler

aws lambda update-function-configuration \
    --function-name migrate-testrail \
    --memory-size 256

## 15m, maximum for AWS
aws lambda update-function-configuration \
    --function-name migrate-testrail \
    --timeout 900
```

## Add lambda event execution config (necessary for running from SDK)

```
aws lambda put-function-event-invoke-config \
  --function-name migrate-testrail \
  --maximum-retry-attempts 2 \
  --maximum-event-age-in-seconds 3600 \
  --region {AWS_REGION}
```

## Further deploys

Handled via Github Actions.  
Must have these variables to configure.

Env variables (must be configured for "production" environment, if it's not present for your GitHub project - create it in Settions):
- `LAMBDA_FUNCTION_NAME` (default is "migrate-testrail")

Secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_ACCOUNT_ID` (AWS numeric account id, like 464383111111, to mask it inside logs). Use `aws sts get-caller-identity` to get it.

---

## Run from CLI (event.json must exist and contain valid creds, see event.json.example)
```
openssl base64 -in event.json -out event.json.base64
aws lambda invoke --function-name migrate-testrail --payload file://event.json.base64 response.json
```

## Run from Ruby SDK

See https://github.com/aws/aws-sdk-ruby

