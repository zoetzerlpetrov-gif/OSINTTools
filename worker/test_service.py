import hashlib
import hmac
import os
import time
import unittest

os.environ.setdefault("OSINTTOOLS_WORKER_SECRET", "0123456789abcdef0123456789abcdef")

from worker import service


class WorkerSecurityTests(unittest.TestCase):
    def test_signature_accepts_current_timestamp_and_rejects_replay(self):
        timestamp = str(int(time.time()))
        nonce = "12345678-1234-1234-1234-123456789abc"
        body = b'{"username":"analista"}'
        signature = hmac.new(
            os.environ["OSINTTOOLS_WORKER_SECRET"].encode(),
            timestamp.encode("ascii") + b"." + nonce.encode("ascii") + b"." + body,
            hashlib.sha256,
        ).hexdigest()
        self.assertTrue(service.valid_signature(timestamp, nonce, signature, body))
        self.assertFalse(service.valid_signature(timestamp, nonce, signature, body))

    def test_input_requires_authorization_and_bounded_sites(self):
        with self.assertRaisesRegex(ValueError, "autorización"):
            service.validate_job_input({"username": "analista", "purpose": "self-audit", "maxSites": 100})
        with self.assertRaisesRegex(ValueError, "maxSites"):
            service.validate_job_input({"username": "analista", "purpose": "self-audit", "maxSites": 501, "authorizationAcknowledged": True})

    def test_report_normalization_discards_raw_content(self):
        findings = service.normalize_report({
            "Example": {
                "url_user": "https://example.com/analista",
                "response_text": "raw sensitive page",
                "site": {"tags": ["social"]},
                "http_status": 200,
            }
        }, "analista")
        self.assertEqual(findings[0]["verification"], "claimed")
        self.assertNotIn("raw sensitive page", str(findings))
        self.assertEqual(findings[0]["details"]["httpStatus"], 200)


if __name__ == "__main__":
    unittest.main()
