/* Default Firebase project for the shared song library (see song-cloud.js).
 * Scripture Pod bundles use this project directly. Anyone can point the app at another project, or switch
 * the cloud database off, in the song search window (More sources > Cloud song database).
 * Access is controlled by the Firestore security rules on the "songs" collection, not by the API key. */
window.SP_FIREBASE_CONFIG = {
  projectId: 'scripture-pod',
  projectNumber: '483963646608',
  apiKey: ''
};
