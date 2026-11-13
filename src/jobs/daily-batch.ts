// 일 배치 진입점(cron 라우트용). src/app은 애정 수치 모듈을 직접 참조하지 않는 규칙이라 이름을 달리해 재노출한다.
export { runDailyAffection as runDailyBatch } from "./daily-affection";
