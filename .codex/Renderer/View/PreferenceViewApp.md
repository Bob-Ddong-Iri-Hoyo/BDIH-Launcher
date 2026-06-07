# PreferenceView App Container

Source: `src/Renderer/View/PreferenceView/App.tsx`

역할:

- PreferenceView 단독 window entry container.
- developer link URL, YouTube live status, preference callbacks를 연결한다.

현재 책임:

- developer site/github/youtube URL 상수 관리.
- PreferenceView에 props 전달.
- standalone preference window에서 필요한 기본값 제공.

UI 변경 지시 포인트:

- 실제 UI는 `PreferenceView.md`를 우선 수정한다.
- URL/channel/live status 연결 정책은 이 문서에 적는다.

유지할 계약:

- View 본체는 props 기반으로 유지한다.
