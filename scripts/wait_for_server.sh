LATEST_LOG_BEFORE_READY="Registered platform: itslearning-mock"

if ! timeout 60 bash -c "while [ ! -f output.log ] || ! grep -m 1 \"$LATEST_LOG_BEFORE_READY\" output.log; do sleep 1; done"; then
    echo "Check why the server is not ready"
    cat output.log
    echo "Error: Server is not working correctly." >&2
    exit 1
fi
