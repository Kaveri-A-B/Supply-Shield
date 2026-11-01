# Privacy policy

## Scope

This project is a read-only dashboard for shipment and supply-chain risk analysis. It is designed to display historical operational data from the provided dataset and does not require personal account sign-in.

## Information collected

The application does not currently require users to create accounts or provide personal information. The dataset itself contains operational shipment metadata such as dates, ports, carrier route information, product category, weight, and disruption indicators.

When the API is connected to MongoDB, any records created through the API may include operational data entered by a user or administrator. This data is business metadata rather than personal customer data and should be handled according to the organization’s internal privacy and retention policy.

## Why data is collected

The app collects and displays operational shipment data to support review, export, and dashboard analysis. The data is used for historical monitoring and operational insight rather than personalized profiling.

## Storage and protection

- The frontend reads data from a public JSON file or an API endpoint.
- Sensitive configuration, including database connection strings, is stored as environment variables.
- MongoDB storage should be protected through the deployment platform’s access controls and least-privilege credentials.

## Third parties and tracking

This project does not currently use advertising trackers or analytics cookies. The application may be hosted on Render, which processes the deployment environment and runtime hosting for the site but does not change the project’s core data model.

## Retention

- Dataset files are retained as part of the project repository and deployment build.
- Database records created through the API should follow a documented retention policy for business operational data.
- If a record is no longer needed, it should be removed by the system administrator or data owner.

## User rights and contact

Because the application does not collect personal user profiles, there is no direct account-based access request workflow built into the product. Privacy-related questions should be directed to the project owner or operational maintainer responsible for the deployed environment.

## Contact

For privacy concerns or data-handling questions, contact the repository owner or deployment administrator for the active hosting environment.
