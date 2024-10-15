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

## Get account ID

```
aws sts get-caller-identity
```

## Build (very simplified)
```
npm install
zip -r function.zip .
```

## First deploy
```
aws lambda update-function-code --function-name my-nodejs-function --zip-file fileb://function.zip
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

## Run from CLI (event.json must exist, see event.json.example)
```
aws lambda invoke --function-name my-nodejs-function --payload '{}' response.json
```

## Run from Ruby SDK

See https://github.com/aws/aws-sdk-ruby
