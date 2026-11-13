-- Neon에서만 실행한다. PGlite(로컬)에서는 실행하지 않는다(역할 개념이 없음).
-- 전체구조 §2.5-1: billing 쓰기 역할은 world·collective에 쓰지 못하고, growth 역할은 billing에 GRANT가 없다.
CREATE ROLE role_app NOLOGIN;
CREATE ROLE role_billing NOLOGIN;
CREATE ROLE role_growth NOLOGIN;

GRANT USAGE ON SCHEMA personal, world, collective TO role_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA personal TO role_app;
GRANT SELECT ON ALL TABLES IN SCHEMA world, collective TO role_app;

GRANT USAGE ON SCHEMA billing TO role_billing;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing TO role_billing;

GRANT USAGE ON SCHEMA world, collective TO role_growth;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA world, collective TO role_growth;
-- role_growth에는 billing GRANT가 없다(의도).
