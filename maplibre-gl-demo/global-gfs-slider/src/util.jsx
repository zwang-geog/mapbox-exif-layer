const GFS_BASE = 'https://www.mapbox-exif-layer.com/gfs/0p25';

const MAP_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  streets: 'https://tiles.openfreemap.org/styles/liberty',
};

/** Existing mph palette converted to m/s (GFS 10 m wind). */
const WIND_COLOR = [
  [0, [0, 195, 255]],
  [0.9, [0, 228, 248]],
  [1.8, [26, 255, 221]],
  [2.7, [53, 255, 194]],
  [3.6, [80, 255, 167]],
  [4.5, [109, 255, 138]],
  [5.4, [137, 255, 110]],
  [6.3, [165, 255, 82]],
  [7.2, [193, 255, 54]],
  [8.0, [219, 255, 27]],
  [8.9, [249, 243, 1]],
  [9.8, [255, 212, 0]],
  [10.7, [255, 182, 0]],
  [11.6, [255, 151, 0]],
  [12.5, [255, 120, 0]],
  [13.4, [255, 89, 0]],
  [14.3, [255, 55, 0]],
  [15.2, [255, 21, 0]],
  [16.1, [220, 0, 0]],
  [17.0, [182, 0, 0]],
  [17.9, [144, 0, 0]],
  [18.8, [128, 0, 0]],
];

/** Existing °F palette converted to °C (GFS 2 m TMP). */
const TEMPERATURE_COLOR = [
  [-3, [0, 137, 255]],
  [-2, [0, 155, 255]],
  [-1, [0, 176, 255]],
  [0, [0, 194, 255]],
  [1, [0, 214, 254]],
  [2, [5, 235, 242]],
  [3, [19, 251, 228]],
  [4, [36, 255, 211]],
  [6, [50, 255, 197]],
  [7, [67, 255, 180]],
  [8, [81, 255, 166]],
  [9, [98, 255, 149]],
  [10, [115, 255, 131]],
  [11, [132, 255, 115]],
  [12, [149, 255, 98]],
  [13, [163, 255, 84]],
  [14, [180, 255, 67]],
  [16, [194, 255, 52]],
  [17, [211, 255, 36]],
  [18, [228, 255, 19]],
  [19, [242, 251, 5]],
  [20, [254, 232, 0]],
  [21, [255, 215, 0]],
  [22, [255, 196, 0]],
  [23, [255, 179, 0]],
  [24, [255, 159, 0]],
  [26, [255, 140, 0]],
  [27, [255, 121, 0]],
  [28, [255, 102, 0]],
  [29, [255, 85, 0]],
  [30, [255, 66, 0]],
  [31, [255, 50, 0]],
  [32, [255, 30, 0]],
  [33, [249, 14, 0]],
  [34, [225, 1, 0]],
  [36, [202, 0, 0]],
  [37, [181, 0, 0]],
  [38, [158, 0, 0]],
];

const RELATIVE_HUMIDITY_COLOR = [
  [5, [149, 89, 16]],
  [10, [169, 107, 30]],
  [15, [190, 128, 45]],
  [20, [203, 154, 75]],
  [25, [215, 181, 109]],
  [30, [227, 202, 138]],
  [35, [238, 216, 166]],
  [40, [246, 232, 195]],
  [45, [245, 237, 214]],
  [50, [245, 242, 235]],
  [55, [237, 243, 243]],
  [60, [217, 237, 235]],
  [65, [197, 233, 229]],
  [70, [171, 222, 215]],
  [75, [140, 210, 200]],
  [80, [113, 195, 183]],
  [85, [81, 171, 162]],
  [90, [52, 149, 142]],
  [95, [30, 130, 122]],
  [100, [10, 111, 103]],
];

const weatherColorMap = {
  temperature: TEMPERATURE_COLOR,
  rh: RELATIVE_HUMIDITY_COLOR,
  wind: WIND_COLOR,
};

const rasterLegendTitle = {
  temperature: 'Temperature (°C)',
  rh: 'Relative humidity (%)',
};

function unixToCompact(unix) {
  const iso = new Date(unix * 1000).toISOString();
  return iso.slice(0, 13).replace(/[-T]/g, '');
}

/** Current UTC time rounded up to the next whole hour (already on the hour stays). */
function ceilUtcHourUnix() {
  return Math.ceil(Date.now() / 3600000) * 3600;
}

function gfsUrl(variable, unix) {
  const compact = unixToCompact(unix);
  return `${GFS_BASE}/${variable}/${variable}_${compact}.jpeg`;
}

function fetchGfsStatus() {
  return fetch(`${GFS_BASE}/status.json`).then((res) => {
    if (!res.ok) {
      throw new Error(`status.json HTTP ${res.status}`);
    }
    return res.json();
  });
}

/** Hourly init…hourly_until, then 3-hourly through three_hourly_until. */
function expandForecastUnix(status) {
  const hour = 3600;
  const from = status.init_unix;
  const hourlyUntil = status.hourly_until_unix;
  const threeUntil = status.three_hourly_until_unix;
  const frames = [];
  if (![from, hourlyUntil, threeUntil].every((n) => Number.isFinite(n))) {
    return frames;
  }
  for (let t = from; t <= hourlyUntil; t += hour) {
    frames.push(t);
  }
  for (let t = hourlyUntil + 3 * hour; t <= threeUntil; t += 3 * hour) {
    frames.push(t);
  }
  return frames;
}

function formatFrameLabel(unix) {
  return new Date(unix * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function nearestFrameIndex(frames, unix) {
  if (!frames.length) return 0;
  let best = 0;
  let bestDelta = Math.abs(frames[0] - unix);
  for (let i = 1; i < frames.length; i += 1) {
    const delta = Math.abs(frames[i] - unix);
    if (delta < bestDelta) {
      best = i;
      bestDelta = delta;
    }
  }
  return best;
}

function WeatherColorbar({ colors }) {
  const gradientStops = colors.map((color, i) => ({
    offset: `${(i / (colors.length - 1)) * 100}%`,
    color: `rgba(${color[1].join(',')})`,
  }));

  return (
    <svg width="54" height={colors.length * 20}>
      <defs>
        <linearGradient id="weatherGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          {gradientStops.map((stop, i) => (
            <stop key={i} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="30" height={colors.length * 20} fill="url(#weatherGradient)" />
      {colors.map((color, i) => (
        <text
          key={i}
          x="35"
          y={i * 20 + 10}
          fontSize="10"
          textAnchor="start"
          dominantBaseline="middle"
        >
          {color[0]}
        </text>
      ))}
    </svg>
  );
}

const BASEMAP_STYLES = {
  dark: {
    url: MAP_STYLES.dark,
    thumb: 'url(/dark.png)',
  },
  streets: {
    url: MAP_STYLES.streets,
    thumb: 'url(/streets.png)',
  },
};

function otherBasemap(basemap) {
  if (basemap === 'streets') {
    return { key: 'dark', label: 'Dark' };
  }
  return { key: 'streets', label: 'Streets' };
}

function styleButtonBase(button) {
  button.type = 'button';
  button.style.width = '75px';
  button.style.height = '75px';
  button.style.border = 'none';
  button.style.borderRadius = '4px';
  button.style.backgroundColor = 'white';
  button.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.1)';
  button.style.cursor = 'pointer';
  button.style.position = 'relative';
  button.style.backgroundSize = 'cover';
  button.style.backgroundPosition = 'center';
  button.style.backgroundRepeat = 'no-repeat';
  button.style.padding = '0';
  button.style.fontSize = '10px';
  button.style.fontWeight = 'bold';
  button.style.color = '#404040';
}

function makeLabel() {
  const text = document.createElement('div');
  text.style.position = 'absolute';
  text.style.bottom = '4px';
  text.style.left = '0';
  text.style.right = '0';
  text.style.textAlign = 'center';
  text.style.lineHeight = '1.2';
  text.style.pointerEvents = 'none';
  text.style.textShadow =
    '-1px -1px 0 white, 1px -1px 0 white, -1px 1px 0 white, 1px 1px 0 white, 0 -1px 0 white, 0 1px 0 white, -1px 0 0 white, 1px 0 0 white';
  return text;
}

class StyleToggleControl {
  constructor() {
    this.basemap = 'dark';
    this._onStyleLoad = this._onStyleLoad.bind(this);
  }

  onAdd(map) {
    this.map = map;
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.container.style.position = 'relative';

    this.button = document.createElement('button');
    styleButtonBase(this.button);
    this.text = makeLabel();
    this.button.appendChild(this.text);
    this.container.appendChild(this.button);

    this.button.addEventListener('click', () => {
      const { key } = otherBasemap(this.basemap);
      this.basemap = key;
      this.map.setStyle(BASEMAP_STYLES[key].url, { diff: false });
    });

    this.map.on('style.load', this._onStyleLoad);
    this.updateButtonContent();

    return this.container;
  }

  _onStyleLoad() {
    this.updateButtonContent();
  }

  onRemove() {
    if (this.map) {
      this.map.off('style.load', this._onStyleLoad);
    }
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.map = undefined;
  }

  updateButtonContent() {
    const { key, label } = otherBasemap(this.basemap);
    this.button.style.backgroundImage = BASEMAP_STYLES[key].thumb;
    this.text.textContent = label;
  }
}

export {
  GFS_BASE,
  MAP_STYLES,
  weatherColorMap,
  rasterLegendTitle,
  gfsUrl,
  ceilUtcHourUnix,
  fetchGfsStatus,
  expandForecastUnix,
  formatFrameLabel,
  nearestFrameIndex,
  WeatherColorbar,
  StyleToggleControl,
};
