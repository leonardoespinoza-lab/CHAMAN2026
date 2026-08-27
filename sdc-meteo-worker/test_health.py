import json
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen

from health import STATE, start_health_server


class HealthEndpointTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = start_health_server(0)
        cls.url = f"http://127.0.0.1:{cls.server.server_address[1]}/health"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def tearDown(self):
        STATE.healthy = False
        STATE.ready = False
        STATE.last_error = None

    def test_disabled_but_healthy_worker_returns_200(self):
        STATE.healthy = True
        STATE.ready = False
        with urlopen(self.url, timeout=2) as response:
            payload = json.loads(response.read())
            self.assertEqual(response.status, 200)
            self.assertTrue(payload["healthy"])
            self.assertFalse(payload["ready"])

    def test_invalid_worker_returns_503(self):
        STATE.healthy = False
        with self.assertRaises(HTTPError) as context:
            urlopen(self.url, timeout=2)
        self.assertEqual(context.exception.code, 503)
        context.exception.close()


if __name__ == "__main__":
    unittest.main()
