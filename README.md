# TestRail ➡ Testomat.io Migration Script

This script migrates test cases from TestRail to [Testomat.io](https://testomat.io) via API.

You are free to customize this script if the default behavior doesn't fit your needs.

## Set Up Locally

* Ensure **NodeJS 20+** is installed
* Clone this repository
* Copy `.env.example` to `.env`

```
cp .env.example .env
```

* Fill in TestRail credentials into `.env` file
* Create [General Token](https://app.testomat.io/account/access_tokens) in Testomat.io
* Fill in Testomat.io credentials into `.env` file

```
TESTOMATIO_TOKEN=testomat_****
TESTOMATIO_PROJECT=**
```

> `TESTOMATIO_PROJECT` is a project URL part, e.g. for `https://app.testomat.io/projects/your-project` it is `your-project`

* Install dependencies

```
npm i
```

* Run script

```
npm start
```

## Debugging

To enable more verbose output you can add debug flags via `DEBUG=` environment variable:

* `DEBUG="testomatio:testrail:in"` - print all data coming from TestRail
* `DEBUG="testomatio:testrail:out"` - print all data posting to Testomat.io
* `DEBUG="testomatio:testrail:migrate"` - print all data processing
* `DEBUG="testomatio:testrail:*"` - print all debug information

```
DEBUG="testomatio:testrail:*" npm start
```

## Customization

We keep this repository public, so you could customize the data you import.

Update `migrate.js` script to customize how sections, suites, and cases are obtained. You can customize the way how steps are transformed or test descriptions.

Update the following file and run the script.

### Importing a Single Test Case

For debugging purposes, you can import or re-import a single test case from TestRail by setting the `TESTRAIL_CASE_ID` environment variable. This is useful when you want to test or refine the migration process for a specific test case that might not have been imported correctly during a full migration.

Run the script with the environment variable:
```
TESTRAIL_CASE_ID=12345 npm start
```

To debug importing of this test case add DEBUG flag:

```
DEBUG="*" TESTRAIL_CASE_ID=12345 npm start
```

**Note:** It is important to use this feature for debugging or improving the script *after* an initial full migration has been performed. When `TESTRAIL_CASE_ID` is set, the script will only process that single test case and then exit.

### Test Runs

To migrate test runs with their results, you need to use a **Project-level API token** from Testomat.io. This is different from the personal API token used for migrating test cases. You can find this token in your project settings under the "API" section.

Select the project you are uploading data to, and set its `TESTOMATIO_REPORT_TOKEN` environment variable to this value.

Then, run the following command:

```bash
npm run migrate-run-results
```

This will migrate all test runs from the TestRail project specified in your `.env` file, along with their test results (passed, failed, skipped). It will skip runs that have already been imported by checking for a special `@id:<run_id>` tag in the run title.

All cases must be imported before run migration started.

To upload artifacts, create S3 bucket and add corresponding S3 credentials to .env file:

```
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_REGION=
S3_BUCKET=

# provide endpoint if you don't use AWS
S3_ENDPOINT=
```

Also inside Project Settings, [set the same S3 credentials](https://docs.testomat.io/project/runs/reporter/artifacts/#set-up-s3-bucket) to ensure that artifacts will be visible by Testomat.io from inside project. 
## Troubleshooting

* **Duplucation of steps in test cases**

This can happen if the template of the testcase changed and TestRail keeps data from both templates. Switch to branch `opt/template-fields-sync` to handle this case. See: https://github.com/testomatio/migrate-testrail/pull/6 

```
git checkout opt/template-fields-sync
npm statr
```


## License

MIT

