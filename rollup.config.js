import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true
    },
    {
      file: 'dist/index.mjs',
      format: 'es',
      sourcemap: true
    },
    {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'MapboxExifLayer',
      globals: {
        'mapbox-gl': 'mapboxgl',
        'exifreader': 'ExifReader'
      },
      sourcemap: true
    }
  ],
  external: ['mapbox-gl', 'exifreader'],
  plugins: [
    resolve(),
    commonjs(),
    terser()
  ]
}; 