/*
Acknowledgements:
This file uses UC Santa Barbara Wildfire Resilience Initiative's webapp's color maps and data sources.
https://www.webapp.wri.ucsb.edu/
*/

const WIND_COLOR = [ [0, [0, 195, 255]],
  [2, [0, 228, 248]],
  [4, [26, 255, 221]],
  [6, [53, 255, 194]],
  [8, [80, 255, 167]],
  [10, [109, 255, 138]],
  [12, [137, 255, 110]],
  [14, [165, 255, 82]],
  [16, [193, 255, 54]],
  [18, [219, 255, 27]],
  [20, [249, 243, 1]],
  [22, [255, 212, 0]],
  [24, [255, 182, 0]],
  [26, [255, 151, 0]],
  [28, [255, 120, 0]],
  [30, [255, 89, 0]],
  [32, [255, 55, 0]],
  [34, [255, 21, 0]],
  [36, [220, 0, 0]],
  [38, [182, 0, 0]],
  [40, [144, 0, 0]],
  [42, [128, 0, 0]]
];

const TEMPERATURE_COLOR = [ [26, [0, 137, 255]],
                            [28, [0, 155, 255]],
                            [30, [0, 176, 255]],
                            [32, [0, 194, 255]],
                            [34, [0, 214, 254]],
                            [36, [5, 235, 242]],
                            [38, [19, 251, 228]],
                            [40, [36, 255, 211]],
                            [42, [50, 255, 197]],
                            [44, [67, 255, 180]],
                            [46, [81, 255, 166]],
                            [48, [98, 255, 149]],
                            [50, [115, 255, 131]],
                            [52, [132, 255, 115]],
                            [54, [149, 255, 98]],
                            [56, [163, 255, 84]],
                            [58, [180, 255, 67]],
                            [60, [194, 255, 52]],
                            [62, [211, 255, 36]],
                            [64, [228, 255, 19]],
                            [66, [242, 251, 5]],
                            [68, [254, 232, 0]],
                            [70, [255, 215, 0]],
                            [72, [255, 196, 0]],
                            [74, [255, 179, 0]],
                            [76, [255, 159, 0]],
                            [78, [255, 140, 0]],
                            [80, [255, 121, 0]],
                            [82, [255, 102, 0]],
                            [84, [255, 85, 0]],
                            [86, [255, 66, 0]],
                            [88, [255, 50, 0]],
                            [90, [255, 30, 0]],
                            [92, [249, 14, 0]],
                            [94, [225, 1, 0]],
                            [96, [202, 0, 0]],
                            [98, [181, 0, 0]],
                            [100, [158, 0, 0]]
                          ];

const RELATIVE_HUMIDITY_COLOR = [ [5, [149, 89, 16]],
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
                                  [100, [10, 111, 103]]
                                ];  

const PRECIPITATION_COLOR = [ [0.17999, [4, 232, 231, 0]],
                              [0.18, [4, 232, 231]],
                              [1, [4, 159, 243]],
                              [2, [4, 0, 243]],
                              [4, [2, 253, 2]],
                              [6, [1, 197, 1]],
                              [8, [0, 141, 0]],
                              [10, [253, 247, 1]],
                              [12, [229, 188, 0]],
                              [14, [253, 149, 0]],
                              [15, [253, 1, 0]],
                              [20, [212, 0, 0]],
                              [30, [188, 0, 0]],
                              [40, [247, 0, 254]],
                              [50, [152, 83, 199]] 
                            ];

const weatherColorMap = {
    'temperature': TEMPERATURE_COLOR,
    'relative-humidity': RELATIVE_HUMIDITY_COLOR,
    'precipitation': PRECIPITATION_COLOR,
    'wind': WIND_COLOR
};

const weatherUrl = (layer, hour) => {
    let folderName = "temperature-images";
    let filePrefix = "te";
    
    if (layer === "temperature") {
        folderName = "temperature-images";
        filePrefix = "te";
    } else if (layer === "relative-humidity") {
        folderName = "relative-humidity-images";
        filePrefix = "rh";
    } else if (layer === "precipitation") {
        folderName = "precipitation-images";
        filePrefix = "pr";
    } else if (layer === "wind") {
        folderName = "wind-images";
        filePrefix = "wind";
    }
    
    return `https://ucsb-wri-data.s3.us-west-1.amazonaws.com/${folderName}/${filePrefix}_${hour}.jpeg`;
}

function WeatherColorbar({ colors }) {
    // Create gradient stops
    const gradientStops = colors.map((color, i) => ({
      offset: `${(i / (colors.length - 1)) * 100}%`,
      color: `rgba(${color[1].join(',')})`
    }));
  
    return (
      <svg width="54" height={colors.length * 20}>
        {/* Define linear gradient */}
        <defs>
          <linearGradient id="weatherGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            {gradientStops.map((stop, i) => (
              <stop key={i} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
  
        {/* Gradient bar */}
        <rect x="0" y="0" width="30" height={colors.length * 20} fill="url(#weatherGradient)" />
  
        {/* Value labels */}
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
        
        {/* Unit label */}
        <text
          x="35"
          y={colors.length * 20 - 10}
          fontSize="10"
          textAnchor="start"
          dominantBaseline="middle"
          fill="white"
        >
        </text>
      </svg>
    );
}

function getCurrentTime() {
    const now = new Date();
    const nextHour = now.getUTCHours() + 1;  // Add 1 hour
    return String(nextHour).padStart(2, '0');  // Pad with leading zero if needed
}

// Custom Style Toggle Control
class StyleToggleControl {
    constructor() {
      this.isSatellite = false;
    }
  
    onAdd(map) {
      this.map = map;
      this.container = document.createElement('div');
      this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
      this.container.style.position = 'absolute';
      this.container.style.top = '10px';
      this.container.style.right = '10px';
      this.container.style.zIndex = '1';
  
      this.button = document.createElement('button');
      this.button.type = 'button';
      this.button.style.width = '75px';
      this.button.style.height = '75px';
      this.button.style.border = 'none';
      this.button.style.borderRadius = '4px';
      this.button.style.backgroundColor = 'white';
      this.button.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.1)';
      this.button.style.cursor = 'pointer';
      this.button.style.display = 'flex';
      this.button.style.flexDirection = 'column';
      this.button.style.alignItems = 'center';
      this.button.style.justifyContent = 'center';
      this.button.style.padding = '8px';
      this.button.style.fontSize = '10px';
      this.button.style.fontWeight = 'bold';
      this.button.style.color = '#404040';
  
      this.image = document.createElement('img');
      this.image.style.width = '40px';
      this.image.style.height = '40px';
      this.image.style.marginBottom = '4px';
  
      this.text = document.createElement('div');
      this.text.style.textAlign = 'center';
      this.text.style.lineHeight = '1.2';
  
      this.button.appendChild(this.image);
      this.button.appendChild(this.text);
      this.container.appendChild(this.button);
  
      this.updateButtonContent();
      this.button.addEventListener('click', this.onClick.bind(this));
  
      return this.container;
    }
  
    onRemove() {
      if (this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this.map = undefined;
    }
  
    updateButtonContent() {
      if (this.isSatellite) {
        this.image.src = '/streets-v12.png';
        this.text.textContent = 'Streets';
      } else {
        this.image.src = '/satellite-streets-v12.png';
        this.text.textContent = 'Satellite';
      }
    }
  
    onClick() {
      this.isSatellite = !this.isSatellite;
      
      const newStyle = this.isSatellite ? 
        'mapbox://styles/mapbox/satellite-streets-v12' : 
        'mapbox://styles/mapbox/streets-v12';
      
      this.map.setStyle(newStyle, { diff: false });
      
      // Update button content immediately
      this.updateButtonContent();
    }
}

export { weatherColorMap, weatherUrl, WeatherColorbar, getCurrentTime, StyleToggleControl };