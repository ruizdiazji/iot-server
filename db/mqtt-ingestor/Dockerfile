FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY mqtt-ingestor/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY mqtt-ingestor/mqtt_to_timescale.py ./mqtt_to_timescaledb.py

CMD ["python", "/app/mqtt_to_timescaledb.py"]
