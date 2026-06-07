# MainView App Container

Source: `src/Renderer/View/MainView/App.tsx`

역할:

- MainView window의 React entry container.
- store, theme, i18n, IPC/window action, mock/default data를 LauncherView에 연결한다.

현재 책임:

- active view state.
- wine catalog/store state 연결.
- preference locale/accent 상태 연결.
- window minimize/maximize/quit action 연결.
- LauncherView에 props 전달.

UI 변경 지시 포인트:

- App container에서는 layout을 직접 바꾸기보다 View props와 data 흐름을 바꾼다.
- 화면 구조 변경은 `LauncherView.md` 또는 `DashboardView.md`를 우선 수정한다.

유지할 계약:

- App container는 Storybook 대상이 아니라 실제 Electron runtime 연결 지점이다.
