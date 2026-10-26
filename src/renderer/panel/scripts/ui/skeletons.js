    // ── Skeleton loading ──────────────────────────────────────────────────────────
    // Grey placeholder rows with a soft shimmer, shown where search results will appear while a search runs.
    function buildSkeletonRows(count = 4, kind = 'card') {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = `sk-row sk-${kind}`;
        row.setAttribute('aria-hidden', 'true');
        row.style.setProperty('--sk-i', String(i));
        // the lines get slightly different widths so the rows do not look stamped
        const widths = [62, 78, 54, 70, 46, 66];
        row.innerHTML = `<span class="sk sk-title" style="width:${widths[i % widths.length]}%"></span><span class="sk sk-sub" style="width:${Math.max(30, widths[(i + 2) % widths.length] - 18)}%"></span>`;
        frag.appendChild(row);
      }
      return frag;
    }
    function showSkeleton(host, count = 4, kind = 'card') {
      if (!host) return;
      host.replaceChildren(buildSkeletonRows(count, kind));
      host.style.display = '';
      host.setAttribute('aria-busy', 'true');
    }
    function clearSkeletonBusy(host) { if (host) host.removeAttribute('aria-busy'); }
