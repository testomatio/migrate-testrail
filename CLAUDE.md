# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TestRail to Testomat.io migration script that transfers test cases and test runs from TestRail to Testomat.io via API. The project includes both local execution and AWS Lambda deployment capabilities.

## Common Commands

### Development Commands
- `npm start` - Run the main migration script for test cases
- `npm run migrate-run-results` - Migrate test runs with their results
- `npm install` - Install dependencies

### Environment Setup
- Copy `.env.example` to `.env` and configure credentials
- Set `TESTRAIL_URL`, `TESTRAIL_USERNAME`, `TESTRAIL_PASSWORD`, `TESTRAIL_PROJECT_ID`
- Set `TESTOMATIO_TOKEN`, `TESTOMATIO_PROJECT`
- For test runs migration, set `TESTOMATIO_REPORT_TOKEN`

### Debugging Commands
- `DEBUG="testomatio:testrail:*" npm start` - Enable all debug output
- `DEBUG="testomatio:testrail:in" npm start` - Debug TestRail API calls
- `DEBUG="testomatio:testrail:out" npm start` - Debug Testomat.io API calls
- `DEBUG="testomatio:testrail:migrate" npm start` - Debug migration processing

### Single Item Migration
- `TESTRAIL_CASE_ID=12345 npm start` - Import single test case
- `TESTRAIL_RUN_ID=123 npm run migrate-run-results` - Import single test run

### AWS Lambda Deployment
- `sam local invoke MigrateFromTestrail -e event.json` - Local testing
- GitHub Actions handles deployment with proper secrets configured

## Architecture

### Core Components

1. **run.js** - Main entry point that configures TestRail and Testomat.io connections
2. **migrate.js** - Core migration logic for test cases, handles:
   - Suite and section structure mapping
   - Custom field conversion to labels
   - Test case content transformation
   - Attachment download and upload
   - Priority and type mapping
3. **migrate-testruns.js** - Test run migration with results and attachments
4. **testrail.js** - TestRail API client for **importing data from TestRail** (authentication, data fetching, file downloads)
5. **testomatio.js** - Testomat.io API client for **exporting data to Testomat.io** (JWT authentication, data posting, file uploads)

### Data Flow

1. **Authentication**: Both APIs require authentication (Basic auth for TestRail, JWT for Testomat.io)
2. **Structure Migration**: TestRail suites/sections → Testomat.io suites (with folder/file type handling)
3. **Test Case Migration**: Custom fields → Labels, attachments → uploaded files, refs → Jira issues or labels
4. **Test Run Migration**: Results with status mapping, attachments → S3 storage

### Key Features

- **Template Field Handling**: Special logic for different TestRail templates (template_id 1 vs 2)
- **Custom Field Mapping**: Converts TestRail custom fields to Testomat.io labels with proper type mapping
- **Attachment Processing**: Downloads from TestRail and uploads to Testomat.io with S3 support
- **Rate Limiting**: Built-in retry logic with exponential backoff
- **Duplicate Prevention**: Uses origin_id to prevent duplicate imports

### API Module Responsibilities

- **testrail.js** - Handles all TestRail API interactions for importing data:
  - Authentication with Basic auth
  - Fetching test cases, suites, sections, runs
  - Downloading attachments and files
  - Pagination handling
  
- **testomatio.js** - Handles all Testomat.io API interactions for exporting data:
  - JWT authentication and token management
  - Posting test cases, suites, labels, runs
  - Uploading attachments and files
  - Rate limiting and retry logic

### Environment Variables

Required for test case migration:
- `TESTRAIL_URL`, `TESTRAIL_USERNAME`, `TESTRAIL_PASSWORD`, `TESTRAIL_PROJECT_ID`
- `TESTOMATIO_TOKEN`, `TESTOMATIO_PROJECT`

Required for test run migration:
- `TESTOMATIO_REPORT_TOKEN` (project-level token)

Optional:
- `TESTRAIL_SUITE_ID` - Limit migration to specific suite
- `DRY_RUN` - Skip actual API calls for testing
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET` - For attachment storage

## Branch Information

- `main` - Standard migration behavior
- `opt/template-fields-sync` - Handles TestRail template field synchronization issues (prevents step duplication)