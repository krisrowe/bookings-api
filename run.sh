#!/bin/bash

REGION=us-central1
SERVICE_NAME=api

# Check if the Cloud Run service exists and return its name if it does
service_exists() {
    EXISTS=$(gcloud run services list --platform=managed --region=$REGION --project=$1 --filter="metadata.name=$SERVICE_NAME" --format="value(metadata.name)")
    echo $EXISTS
}

# Deploy or update the Cloud Run service
deploy_service() {
    SERVICE_EXISTS=$(service_exists $1)
    BOOKING_SERVICE_HOST=$(gcloud run services describe bookings --platform=managed --region=$REGION --project=$1 --format="value(status.url)" | sed 's|https://||')

    if [ -z "$BOOKING_SERVICE_HOST" ]; then
        echo "Failed to fetch the BOOKING_SERVICE_HOST."
        exit 1
    fi

    echo "Using BOOKING_SERVICE_HOST: $BOOKING_SERVICE_HOST"

    if [ -z "$SERVICE_EXISTS" ]; then
        echo "Service does not exist, creating a new one..."
        API_KEY=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32)
        gcloud run deploy $SERVICE_NAME \
            --source=. \
            --platform=managed \
            --region=$REGION \
            --allow-unauthenticated \
            --service-account=guest-web@$1.iam.gserviceaccount.com \
            --project=$1 \
            --set-env-vars=API_KEY="$API_KEY",BOOKINGS_SERVICE_HOST="$BOOKING_SERVICE_HOST"
    else
        echo "Service exists, updating without changing API_KEY..."
        gcloud run deploy $SERVICE_NAME \
            --source=. \
            --platform=managed \
            --region=$REGION \
            --allow-unauthenticated \
            --service-account=guest-web@$1.iam.gserviceaccount.com \
            --project=$1 \
            --update-env-vars=BOOKINGS_SERVICE_HOST="$BOOKING_SERVICE_HOST"
    fi
}

# Test the deployed Cloud Run service
test_service() {
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform=managed --region=$REGION --project=$1 --format="value(status.url)")

    if [ -z "$SERVICE_URL" ]; then
        echo "Failed to fetch the service URL."
        exit 1
    fi

    echo "Invoking service at $SERVICE_URL with API_KEY..."
    RESPONSE=$(curl -s -o response.json -w "%{http_code}" -H "x-apikey: $2" "${SERVICE_URL}/o/default/cleanings")
    
    if [ "$RESPONSE" -eq 200 ]; then
        echo "Service response (formatted):"
        cat response.json | jq .
    else
        echo "Service invocation failed with status code: $RESPONSE"
        cat response.json
    fi
    
    # Clean up
    rm -f response.json
}

# Main script logic
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 {deploy|test} PROJECT_ID"
    exit 1
fi

COMMAND=$1
PROJECT_ID=$2

case "$COMMAND" in
    deploy)
        deploy_service $PROJECT_ID
        ;;
    test)
        # Fetch the API_KEY from Cloud Run service's environment variables if needed
        API_KEY=$(gcloud run services describe $SERVICE_NAME --platform=managed --region=$REGION --project=$PROJECT_ID --format=json | jq -r '.spec.template.spec.containers[0].env[] | select(.name == "API_KEY").value')
        if [ -z "$API_KEY" ]; then
            echo "API_KEY could not be fetched. Ensure the service is deployed with an API_KEY."
            exit 1
        fi
        test_service $PROJECT_ID $API_KEY
        ;;
    *)
        echo "Invalid command: $COMMAND"
        echo "Usage: $0 {deploy|test} PROJECT_ID"
        exit 1
        ;;
esac
