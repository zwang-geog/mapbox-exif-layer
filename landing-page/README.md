# Landing page

Static homepage for [mapbox-exif-layer](https://github.com/zwang-geog/mapbox-exif-layer).

## Deploy on Render (Static Site)

1. **New → Static Site** → connect this repo
2. **Root directory:** `landing-page`
3. **Build command:** (leave empty)
4. **Publish directory:** `.`
5. Add custom domain (e.g. `mapbox-exif-layer.com`)

Documentation is loaded at runtime from the GitHub README on `main`.

## Local preview

```bash
cd landing-page
python -m http.server 8080
```

Open http://localhost:8080
