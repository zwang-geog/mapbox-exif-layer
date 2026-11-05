import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import numpy as np
from rasterio.transform import from_bounds

import update_goes18 as goes


class GoesPipelineTests(unittest.TestCase):
    def test_discovers_recent_candidates_across_utc_day_boundary(self):
        now = datetime(2026, 11, 5, 1, 15, tzinfo=timezone.utc)
        today = {
            "key": "ABI-L2-MCMIPF/2026/309/01/newest.nc",
            "size": 200,
            "last_modified": datetime(2026, 11, 5, 1, 10, tzinfo=timezone.utc),
        }
        yesterday = {
            "key": "ABI-L2-MCMIPF/2026/308/23/previous.nc",
            "size": 190,
            "last_modified": datetime(2026, 11, 5, 0, 50, tzinfo=timezone.utc),
        }

        with patch.object(goes, "list_day_objects", side_effect=[[today], [yesterday], []]) as listing:
            results = goes.discover_candidates(now, lookback_hours=24)

        self.assertEqual([item["key"] for item in results], [today["key"], yesterday["key"]])
        self.assertEqual(listing.call_count, 2)

    def test_projection_reads_satellite_height_origin_sweep_and_scan_axes(self):
        metadata = {
            "goes_imager_projection_grid_mapping_name": "geostationary",
            "goes_imager_projection_perspective_point_height": "35786023",
            "goes_imager_projection_longitude_of_projection_origin": "-137",
            "goes_imager_projection_semi_major_axis": "6378137",
            "goes_imager_projection_semi_minor_axis": "6356752.31414",
            "goes_imager_projection_sweep_angle_axis": "x",
            "x_add_offset": "-0.15184399",
            "x_scale_factor": "5.6000001e-05",
            "y_add_offset": "0.15184399",
            "y_scale_factor": "-5.6000001e-05",
        }

        projection, height, x0, dx, y0, dy = goes._projection(metadata)
        self.assertTrue(projection.is_projected)
        self.assertEqual(height, 35786023)
        self.assertLess(x0, 0)
        self.assertGreater(dx, 0)
        self.assertGreater(y0, 0)
        self.assertLess(dy, 0)

        window = goes._source_window(5424, 5424, projection, height, x0, dx, y0, dy)
        self.assertGreater(window.width, 0)
        self.assertGreater(window.height, 0)
        self.assertLess(window.col_off, 5424)
        self.assertLess(window.row_off, 5424)

    def test_infrared_cloud_alpha_is_soft_and_nodata_stays_transparent(self):
        bounds = goes.REGION_BOUNDS
        west, south, east, north = bounds
        mercator = goes.transform_bounds(
            "EPSG:4326", "EPSG:3857", west, south, east, north, densify_pts=21,
        )
        transform = from_bounds(*mercator, 2, 2)
        infrared = np.array([[292.0, 245.0], [np.nan, 300.0]], dtype=np.float32)
        image = goes.compose_cloud_texture(
            infrared,
            None,
            None,
            None,
            datetime(2026, 11, 5, 1, tzinfo=timezone.utc),
            transform,
        )

        self.assertEqual(image.shape, (2, 2, 4))
        self.assertEqual(image[1, 0, 3], 0)
        self.assertEqual(image[1, 1, 3], 0)
        self.assertGreater(image[0, 1, 3], image[0, 0, 3])
        self.assertEqual(image[0, 0, 3], 0)
        self.assertLessEqual(image[..., 3].max(), round(0.42 * 255))
        self.assertLess(image[0, 1, 0], image[0, 1, 1])
        self.assertLess(image[0, 1, 1], image[0, 1, 2])
        self.assertLess(image[0, 1, 1] - image[0, 1, 0], 24)

    def test_visible_reflectance_clouds_are_used_in_daylight(self):
        transform = from_bounds(-12_700_000, 2_500_000, -11_900_000, 3_300_000, 2, 2)
        infrared = np.full((2, 2), 298, dtype=np.float32)
        visible = np.array([[0.8, 0.05], [0.8, 0.05]], dtype=np.float32)
        image = goes.compose_cloud_texture(
            infrared,
            visible,
            visible,
            visible,
            datetime(2026, 6, 21, 19, tzinfo=timezone.utc),
            transform,
        )

        self.assertGreater(image[0, 0, 3], image[0, 1, 3])
        self.assertGreater(image[1, 0, 3], image[1, 1, 3])

    def test_product_times_require_timezone_and_normalize_to_utc(self):
        value = goes.parse_iso_utc("2026-11-05T01:09:53.2Z")
        self.assertEqual(value.tzinfo, timezone.utc)
        self.assertEqual(value.hour, 1)
        with self.assertRaises(ValueError):
            goes.parse_iso_utc("2026-11-05T01:09:53")


if __name__ == "__main__":
    unittest.main()
