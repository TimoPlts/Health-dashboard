// Overwritten by the CI workflow before bundling. The iOS OAuth client ID is NOT a secret (iOS clients have none);
// it comes from the repository variable GOOGLE_IOS_CLIENT_ID so it is not committed here.
export const BUILD = { number: "dev", commit: "local", googleIosClientId: "" };
