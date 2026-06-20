// Japan SVG path generator from world-atlas TopoJSON
// Run: node gen-japan-map.js
import('topojson-client').then(async (topojson) => {
  const https = await import('https');

  function fetch(url) {
    return new Promise((res, rej) => {
      https.get(url, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => res(JSON.parse(d)));
        r.on('error', rej);
      }).on('error', rej);
    });
  }

  // Use 50m resolution for better Japan coastline detail
  const topo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json');

  // Extract Japan (id=392) as GeoJSON
  const countries = topojson.feature(topo, topo.objects.countries);
  const japan = countries.features.find(f => f.id === '392');

  if (!japan) {
    console.error('Japan not found'); process.exit(1);
  }

  // Our SVG viewBox: "0 0 420 520"
  // Japan lng range: 122 - 148 (26 deg) → x: 0 - 420
  // Japan lat range: 24 - 46  (22 deg) → y: 0 - 520
  const W = 420, H = 520;
  const lngMin = 122, lngRange = 26;
  const latMax = 46,  latRange = 22;

  function project([lng, lat]) {
    const x = ((lng - lngMin) / lngRange * W).toFixed(1);
    const y = ((latMax - lat) / latRange * H).toFixed(1);
    return `${x},${y}`;
  }

  function ringToPath(ring) {
    return 'M' + ring.map(project).join('L') + 'Z';
  }

  const geom = japan.geometry;
  const paths = [];

  if (geom.type === 'Polygon') {
    paths.push(ringToPath(geom.coordinates[0]));
  } else if (geom.type === 'MultiPolygon') {
    // Sort polygons by size (descending) to get main islands first
    const polys = geom.coordinates.map(poly => ({
      ring: poly[0],
      area: polyArea(poly[0])
    })).sort((a, b) => b.area - a.area);

    // Keep polygons with area > threshold (filter out tiny islets)
    const threshold = polyArea(polys[0].ring) * 0.0005;
    polys.filter(p => p.area > threshold).forEach(p => {
      paths.push(ringToPath(p.ring));
    });
  }

  function polyArea(ring) {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    }
    return Math.abs(area / 2);
  }

  console.log(`<!-- Generated from Natural Earth 50m data -->`);
  console.log(`<!-- ${paths.length} polygons -->`);
  paths.forEach((d, i) => {
    console.log(`<path d="${d}"/>`);
  });

}).catch(err => {
  console.error(err);
  process.exit(1);
});
