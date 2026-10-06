"""إعداد gunicorn للإنتاج. كل قيمة قابلة للضبط بمتغير بيئة بنفس الاسم بالأحرف الكبيرة."""

import multiprocessing
import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
# الحزمة الصيانة uvicorn-worker هي بديل uvicorn.workers.UvicornWorker المهجور (نفس الصنف والسلوك)
worker_class = "uvicorn_worker.UvicornWorker"
workers = int(os.environ.get("WEB_CONCURRENCY", min(2 * multiprocessing.cpu_count() + 1, 4)))
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "60"))
graceful_timeout = int(os.environ.get("GUNICORN_GRACEFUL_TIMEOUT", "30"))  # يُنهي الطلبات الجارية عند الإيقاف
keepalive = 5
max_requests = 2000  # إعادة تدوير العمال دوريًا ضد تسرب الذاكرة
max_requests_jitter = 200
worker_tmp_dir = "/dev/shm"  # heartbeat في الذاكرة (يتجنب توقف العمال بسبب قرص بطيء)
forwarded_allow_ips = os.environ.get("FORWARDED_ALLOW_IPS", "*")  # خلف Nginx داخل شبكة Docker الخاصة
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info")
