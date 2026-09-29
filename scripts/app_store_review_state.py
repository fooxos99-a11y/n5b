def wait_for_review_cancellation(submission_ids, request, sleep, attempts=60):
    """Apple may unlock version metadata before releasing its review item."""
    pending = set(submission_ids)
    for attempt in range(attempts):
        for submission_id in tuple(pending):
            response = request(f"/reviewSubmissions/{submission_id}")
            if response["data"]["attributes"]["state"] == "COMPLETE":
                pending.remove(submission_id)
        if not pending:
            return
        if attempt + 1 < attempts:
            sleep(5)
    raise RuntimeError("Apple is still canceling the previous review submission; retry after cancellation completes.")
