# Shared wording for both integration guides

After this pull request is merged, replace the Integration Examples section in both the Server API and Web Submission guides with the same wording below. These links target `main`; use the PR branch to preview the files before merge. This avoids publishing links to unmerged files or retaining the outdated OSS-hosted collection.

---

## Integration Examples

**Postman Collection**

Explore and test the LegitApp Developer API directly with our Postman collection. Start with the Sandbox environment and your Sandbox developer secret. A separate Production environment is included for live integrations. No local application is required.

- [Download the Developer API collection](https://github.com/legitappcom/legitapp-developer-api-example/blob/main/postman/LegitApp-Developer-API.postman_collection.json)
- [Download the Sandbox environment](https://github.com/legitappcom/legitapp-developer-api-example/blob/main/postman/environments/Sandbox.postman_environment.json)
- [Download the Production environment](https://github.com/legitappcom/legitapp-developer-api-example/blob/main/postman/environments/Production.postman_environment.json)
- [Postman setup and testing instructions](https://github.com/legitappcom/legitapp-developer-api-example/blob/main/postman/README.md)

Open a JSON file on GitHub and select **Download raw file**, then import it into Postman. Select the matching environment and enter your developer secret locally.

**TypeScript and Express Example**

Explore a sample application demonstrating how to call the LegitApp Developer API and handle webhook events using TypeScript and Express. The project includes Server API and Web Submission workflows, authentication details, PDF certificates and cancellation examples.

[View the example project and setup instructions](https://github.com/legitappcom/legitapp-developer-api-example)

A separate local Postman collection is included for testing the running example application. See the project's Postman instructions for the local setup and webhook simulation examples.
