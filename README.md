# TLP-CAPT

Centralised Agile PenTesting (CAPT) service is a Technical Leadership Programme (TLP 2021 cohort) project by Keith Tay, Toh Kian Hui and Soh Yu Ming. CAPT aims to integrate pentesting into Agile processes where code changes will automatically trigger pentesters to review and provide timely feedback through Jira issues on security vulnerabilities. This is a working POC of CAPT integration with ship.gov.sg Bitbucket and Jira to provide this automated service.


**Automatic creation of pentesting cycle as Jira Epic**

<img src="https://user-images.githubusercontent.com/6994570/131611801-b347ff25-0f01-4c93-821d-cbfb2bb8a4ee.png" width="400" />

**Automatic generation of code diff link for easy follow up on security findings and fixes**

<img src="https://user-images.githubusercontent.com/6994570/131611902-5da37238-76f7-4f38-9d3c-6d88524ca4f2.png" width="400" />


## Dependencies
NPM depdendencies:
- axios
- knex
- pg

## How to setup
1. Set DB configurations in `db/knexfile.js`
1. Run DB migrations `knex migrate:latest`
1. Run DB seed `knex seed:run --specific=sample.js`
1. Provide dependencies using AWS Lambda layer
1. Deploy `lambdas` in AWS Lambda
1. Setup environment variables required by each of the lambdas (see `lambdas` folder)
1. Setup daily cron tab to call `check_epic` lambda
1. Add `curl https://<code_change_lambda_url>?proj_code=<proj_code>` in Bamboo to trigger CAPT service whenever there are code changes
