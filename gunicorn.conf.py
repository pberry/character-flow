# Gunicorn reads this from the working directory (/app in the image).
import os

wsgi_app = "app:create_app()"
bind = "0.0.0.0:8000"
workers = int(os.environ.get("GUNICORN_WORKERS", 2))
threads = 4
accesslog = "-"
# No request path: it contains secret chart keys. Method, status, size, seconds.
access_log_format = '%(t)s "%(m)s" %(s)s %(b)s %(L)ss'
