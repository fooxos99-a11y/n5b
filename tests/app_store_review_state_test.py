import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from app_store_review_state import wait_for_review_cancellation


class ReviewCancellationTests(unittest.TestCase):
    def test_waits_for_all_canceled_submissions_not_only_unlocked_version(self):
        calls = []
        waits = []
        states = {"/reviewSubmissions/a": ["CANCELING", "COMPLETE"],
                  "/reviewSubmissions/b": ["COMPLETE"]}

        def request(path):
            calls.append(path)
            return {"data": {"attributes": {"state": states[path].pop(0)}}}

        wait_for_review_cancellation(["a", "b"], request, waits.append)
        self.assertEqual(calls.count("/reviewSubmissions/a"), 2)
        self.assertEqual(calls.count("/reviewSubmissions/b"), 1)
        self.assertEqual(waits, [5])

    def test_timeout_prevents_submitting_a_duplicate_review_item(self):
        waits = []
        with self.assertRaisesRegex(RuntimeError, "still canceling"):
            wait_for_review_cancellation(
                ["a"], lambda _: {"data": {"attributes": {"state": "CANCELING"}}},
                waits.append, attempts=2,
            )
        self.assertEqual(waits, [5])

    def test_no_cancellation_does_not_call_apple(self):
        def unexpected(_):
            self.fail("No cancellation requires no API call")
        wait_for_review_cancellation([], unexpected, unexpected)


if __name__ == "__main__":
    unittest.main()
