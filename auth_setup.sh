export COMPOSER_PROVIDERS='{
"github": {
"provider": "github",
"module": "passport-github",
"clientID": "4a59865b4246ffb28c60",
"clientSecret": "cd8ce254ad44554208d8e9eac378e0fd45cf232d",
"authPath": "/auth/github",
"callbackURL": "/auth/github/callback",
"successRedirect": "/",
"failureRedirect": "/"
}
}'

export COMPOSER_DATASOURCES='{
"db": {
"name": "db",
"connector": "loopback-connector-mongodb",
"url": "mongodb://ethan:spelunky@ds137110.mlab.com:37110/irs"
}
}'
