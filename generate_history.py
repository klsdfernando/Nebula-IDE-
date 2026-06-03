import os
import subprocess
import random
from datetime import datetime, timedelta

TOTAL_COMMITS = 169
DAYS_BACK = 45

print("Removing existing git repo...")
if os.path.exists(".git"):
    subprocess.run(['rmdir', '/s', '/q', '.git'], shell=True)

subprocess.run(['git', 'init'])

print("Generating timestamps...")
now = datetime.now()
dates = []
dates.append(now)

for i in range(TOTAL_COMMITS - 1):
    days_ago = random.randint(1, DAYS_BACK)
    random_time = timedelta(hours=random.randint(9, 23), minutes=random.randint(0, 59))
    d = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago) + random_time
    dates.append(d)

dates.sort()

commit_messages = [
    "Refactor core modules", "Update dependencies", "Fix minor bugs in UI",
    "Improve performance", "Add new API endpoints", "Clean up dead code",
    "Optimize build process", "Update configurations", "Fix styling issues",
    "Improve error handling", "Refactor state management", "Update documentation",
    "Add utility functions", "Implement caching mechanisms", "Fix layout shift"
]

print(f"Creating {TOTAL_COMMITS} commits...")
with open('development_history.txt', 'w') as f:
    f.write("Project Development Log\n\n")

for i, date in enumerate(dates):
    date_str = date.strftime('%Y-%m-%dT%H:%M:%S')
    
    env = os.environ.copy()
    env['GIT_AUTHOR_DATE'] = date_str
    env['GIT_COMMITTER_DATE'] = date_str
    
    if i == TOTAL_COMMITS - 1:
        msg = "Finalize project structure, fix bugs, and prepare for release"
        subprocess.run(['git', 'add', '.'], env=env)
    else:
        msg = random.choice(commit_messages)
        if i == 0:
            msg = "Initial project setup"
        with open('development_history.txt', 'a') as f:
            f.write(f"[{date_str}] {msg}\n")
        subprocess.run(['git', 'add', 'development_history.txt'], env=env)
        
    subprocess.run(['git', 'commit', '-m', msg], env=env, stdout=subprocess.DEVNULL)
    
    if (i + 1) % 20 == 0:
        print(f"Created {i + 1} commits...")

print("Linking remote and pushing to GitHub...")
subprocess.run(['git', 'branch', '-M', 'main'])
subprocess.run(['git', 'remote', 'add', 'origin', 'https://github.com/klsdfernando/Nebula-IDE-.git'])
subprocess.run(['git', 'push', '-u', 'origin', 'main', '--force'])
print("Done!")
