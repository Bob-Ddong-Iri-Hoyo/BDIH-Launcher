# LauncherView

Source: `src/Renderer/View/MainView/MainView.tsx`
Story: `src/Renderer/Stories/View/MainView.stories.tsx`

역할:

- MainFrame 안에서 dashboard, logs, preferences view를 조립하는 최상위 renderer view.

현재 UI 흐름:

- MainFrame을 shell로 사용한다.
- `activeView === "dashboard"`이면 DashboardView.
- `activeView === "logs"`이면 ViewSurface 안에 LogViewer.
- `activeView === "preferences"`이면 PreferenceView.
- dashboard에서 Bottle이 선택되면 header title은 DashboardBreadcrumb가 된다.
- Bottle detail에서는 headerLeading에 back IconButton이 표시된다.

주요 props:

- `activeView`
- window actions.
- wine/bottle data.
- preference data.
- log entries/sessions/sources.

UI 변경 지시 포인트:

- 화면 전환 구조.
- header title/subtitle 동적 표시.
- logs/preferences를 어디에 배치할지.
- Bottle detail 진입 시 MainFrame header 처리.

유지할 계약:

- MainFrame navigation key는 `dashboard`, `logs`, `preferences`다.
