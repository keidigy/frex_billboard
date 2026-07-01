# Frex Billboard

단기, 중기, 장기 주식 리그의 등록 종목 수익률을 순위화하는 Next.js 앱입니다.

## 실행

```bash
pnpm install
pnpm dev
```

로컬 DB는 `.db/frex-billboard.sqlite`에 생성됩니다. `.db/`는 `.gitignore`에 포함되어 배포/커밋 대상에서 제외됩니다.

## Production DB

Vercel 배포 환경에서는 로컬 파일 시스템이 영속 저장소가 아니므로 Turso/libSQL을 사용합니다.

필수 환경 변수:

```bash
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

환경 변수가 없으면 Vercel에서는 앱이 명시적으로 실패합니다. 로컬 개발은 위 환경 변수 없이 `.db/frex-billboard.sqlite`를 사용합니다.

## 최초 admin

사용자 DB가 비어 있으면 `/setup`에서 최초 관리자를 생성합니다. 최초 생성자는 자동으로 `admin` 권한과 승인 상태를 받습니다.

## 주요 화면

- `/` 대시보드
- `/rankings` 역대 순위표
- `/leagues` 역대 모든 리그 결과
- `/settings` 비밀번호 변경 및 종목 등록
- `/admin` 회원/초대 코드/가격 보정/감사 로그 관리
- `/admin/debug` 리그 시각, provider 장애, seed 데이터 시뮬레이션

## 주가 Provider

서버 전용 adapter가 Naver Finance, Investing.com, Yahoo Finance 순서로 시세 조회를 시도합니다. 모두 실패하면 admin 수동 보정 대상으로 넘기고, 수동 보정은 감사 로그에 기록합니다.
