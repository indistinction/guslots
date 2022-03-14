"""
Publishes files from the current directory to Bunny CDN

To use...

python3 ~/bunny-upload/bunny.py 'bunny-storage-zone' 'api-key-password'

If you're on the command line, bash alias bcdn="~/bunny-upload/bunny.py"

Indistinction (RD) 2020
"""

import requests, sys, os

base_url = "https://storage.bunnycdn.com"
storage_zone = str(sys.argv[1])
headers = {"AccessKey": str(sys.argv[2])}

# Delete existing files
old_files = requests.get("{}/{}/".format(base_url, storage_zone), headers=headers).json()
for f in old_files:
    path = "{}{}{}".format(base_url, f["Path"], f["ObjectName"])
    if f["IsDirectory"]:
        path += "/"
    print("Deleting " + path + "...")
    requests.delete(path, headers=headers)
    
print("DONE!\n")
    
# Upload new ones
for dirname, dirnames, filenames in os.walk('.'):
    for filename in filenames:
        path = os.path.join(dirname, filename)
        print("Uploading {}/{}{}...".format(base_url, storage_zone, path[1:]))
        with open(path, "rb") as f:
            requests.put("{}/{}{}".format(base_url, storage_zone, path[1:]), headers=headers, data=f.read())

print("DONE! You may now perform a manually cache refresh at bunny.net")
