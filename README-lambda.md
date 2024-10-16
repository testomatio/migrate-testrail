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

## Build (very simplified)
```
npm install
zip -r function.zip .
```

## Get account ID (for the next step)

```
aws sts get-caller-identity
```

## First deploy
```
aws lambda create-function --function-name my-nodejs-function \
    --zip-file fileb://function.zip --handler lambda.handler --runtime nodejs18.x \
    --role arn:aws:iam::{ACCOUNT-ID}:role/lambda-exec-role
```

## Tune Lambda options for the first run

```
aws lambda update-function-configuration \
    --function-name my-nodejs-function \
    --handler lambda.handler

aws lambda update-function-configuration \
    --function-name my-nodejs-function \
    --memory-size 256

## 15m, maximum for AWS
aws lambda update-function-configuration \
    --function-name my-nodejs-function \
    --timeout 900
```

## Further deploys
```
zip -r function.zip .
aws lambda update-function-code --function-name my-nodejs-function --zip-file fileb://function.zip
```

---

## Run from CLI (event.json must exist and contain valid creds, see event.json.example)
```
openssl base64 -in event.json -out event.json.base64
aws lambda invoke --function-name my-nodejs-function --payload file://event.json.base64 response.json
```

## Run from Ruby SDK

See https://github.com/aws/aws-sdk-ruby
