    // ── Songs a search finds in the app are added to the cloud library too ─────────────
    // A search that matches songs saved in the app sends each one to the shared Firebase library, if it is not
    // there yet (a song the library already has is left as it is). It happens quietly, a moment after typing stops,
    // and never more than a few songs at a time. src/shared/song-cloud.js does the matching and the sending.
    let cloudSongSyncTimer = 0;
    function queueCloudSyncForSearch(query, opts) {
      const cloud = window.SP_SONG_CLOUD;
      if (!cloud || !cloud.isEnabled() || typeof songs === 'undefined') return;
      const q = String(query || '').trim();
      if (q.length < 2) return;
      clearTimeout(cloudSongSyncTimer);
      cloudSongSyncTimer = setTimeout(() => {
        const found = cloud.findLocalMatches(songs, q, opts);
        found.forEach((song) => { cloud.uploadSong(song, { createOnly: true }); });
      }, (opts && opts.delay) || 1200);
    }
