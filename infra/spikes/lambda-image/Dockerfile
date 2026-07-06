# T-006 spike: does the ML dependency stack fit the Lambda container limit (<10 GB)?
# Official AWS Lambda Python 3.12 base + the full modeling stack + a no-op handler.
FROM public.ecr.aws/lambda/python:3.12

# lightgbm dynamically loads the OpenMP runtime, absent from the AL2023 Lambda base image.
RUN dnf install -y libgomp && dnf clean all

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY handler.py ${LAMBDA_TASK_ROOT}

CMD ["handler.handler"]
