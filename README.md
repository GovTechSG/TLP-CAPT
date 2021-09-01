# TLP-CAPT

Centralised Agile PenTesting (CAPT) service is a Technical Leadership Programme (TLP 2021 cohort) project by Keith Tay, Toh Kian Hui and Soh Yu Ming. CAPT aims to integrate pentesting into Agile processes where code changes will automatically trigger pentesters to review and provide timely feedback on security vulnerabilities through Jira issues. This is a working POC of CAPT integration with ship.gov.sg Bitbucket and Jira to provide this automated service.

## Dependencies
NPM depdendencies:
- axios
- knex
- pg

## How to setup
1. Set DB configurations in `db/knexfile.js`
1. Run DB migrations `knex migrate:latest`
1. Run DB seed `knex seed:run --specific=sample.js`
1. Deploy `lambdas` in AWS Lambda
1. Provide dependencies using AWS Lambda layer
1. Setup environment variables required by each of the lambdas (see `lambdas` folder)
