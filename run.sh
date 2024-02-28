#!/bin/bash

REGION=us-central1
FUNCTION_NAME=api

# Deploy the Cloud Function
deploy_function() {
    echo "Deploying function..."
    
    # Retrieve the BOOKING_SERVICE_HOST URL from Cloud Run service
    BOOKING_SERVICE_HOST=$(gcloud run services describe bookings --platform=managed --region=$REGION --project=$1 --format="value(status.url)")

    # Remove the https:// prefix from BOOKING_SERVICE_HOST
    BOOKING_SERVICE_HOST=${BOOKING_SERVICE_HOST#https://}

    if [ -z "$BOOKING_SERVICE_HOST" ]; then
        echo "Failed to fetch the BOOKING_SERVICE_HOST."
        exit 1
    fi

    echo "Using BOOKING_SERVICE_HOST: $BOOKING_SERVICE_HOST"

    gcloud functions deploy $FUNCTION_NAME \
        --gen2 \
        --runtime=nodejs20 \
        --trigger-http \
        --allow-unauthenticated \
        --service-account=guest-web@$1.iam.gserviceaccount.com \
        --project=$1 \
        --region=$REGION \
        --entry-point=helloHttp \
        --set-env-vars=API_KEY="$2",BOOKINGS_SERVICE_HOST="$BOOKING_SERVICE_HOST"
}

# Test the deployed Cloud Function
test_function() {
    echo "Fetching function URL..."
    FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME --gen2 --project=$1 --region=$REGION --format="value(serviceConfig.uri)")

    if [ -z "$FUNCTION_URL" ]; then
        echo "Failed to fetch the function URL."
        exit 1
    fi

    echo "Invoking function at $FUNCTION_URL with API_KEY..."
    RESPONSE=$(curl -s -o response.json -w "%{http_code}" -H "x-apikey: $2" "$FUNCTION_URL/o/default/cleanings")
    
    if [ "$RESPONSE" -eq 200 ]; then
        echo "Function response (formatted):"
        cat response.json | jq .
    else
        echo "Function invocation failed with status code: $RESPONSE"
        cat response.json
    fi
    
    # Clean up
    rm -f response.json
}

# Main script logic
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 {deploy|test} PROJECT_ID API_KEY"
    exit 1
fi

COMMAND=$1
PROJECT_ID=$2
API_KEY=$3

case "$COMMAND" in
    deploy)
        deploy_function $PROJECT_ID $API_KEY
        ;;
    test)
        test_function $PROJECT_ID $API_KEY
        ;;
    *)
        echo "Invalid command: $COMMAND"
        echo "Usage: $0 {deploy|test} PROJECT_ID API_KEY"
        exit 1
        ;;
esac