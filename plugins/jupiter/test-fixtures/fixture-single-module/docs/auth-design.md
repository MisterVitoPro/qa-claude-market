# Auth Design

## Overview

Login and logout behavior for the fixture app. The `login` function returns a
token; `logout` invalidates it.

## Endpoints

- POST /login
- POST /logout

Note: the rotateKey function exists in src/auth.js but is not covered here.
