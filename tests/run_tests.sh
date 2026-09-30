#!/usr/bin/env bash
# يشغّل اختبارات الصلاحيات على PostgreSQL محلي (يحتاج psql وخادم Postgres 15+)
# الاستخدام: PGHOST=... PGPORT=... PGUSER=postgres ./tests/run_tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql -v ON_ERROR_STOP=1 -q -c "drop database if exists nightriders_test" -c "create database nightriders_test"
psql -v ON_ERROR_STOP=1 -q -d nightriders_test -f tests/supabase_mock.sql
psql -v ON_ERROR_STOP=1 -q -d nightriders_test -f supabase/schema.sql 2>&1 | grep -v NOTICE || true
psql -v ON_ERROR_STOP=1 -q -d nightriders_test -f tests/rls_test.sql
