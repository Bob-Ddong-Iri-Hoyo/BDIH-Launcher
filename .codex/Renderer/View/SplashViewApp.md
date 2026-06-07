# SplashView App Container

Source: `src/Renderer/View/SplashView/App.tsx`

역할:

- SplashView window entry container.

현재 책임:

- startup message 후보를 가지고 SplashView에 message/progress를 전달한다.
- 실제 bootstrap state가 연결되기 전까지는 간단한 로딩 화면 container 역할.

UI 변경 지시 포인트:

- message 선택 방식.
- progress source 연결.
- 실제 metadata/catalog preload 상태 연결.

유지할 계약:

- 화면 본체 변경은 `SplashView.md`를 우선 수정한다.
