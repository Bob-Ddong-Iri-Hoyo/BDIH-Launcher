# MainView

Source: `src/Renderer/View/MainView/MainView.tsx`
App: `src/Renderer/View/MainView/App.tsx`
Story: `src/Renderer/Stories/View/MainView.stories.tsx`

역할:

- 앱의 주 화면.
- LauncherView와 DashboardView를 export한다.

현재 구성:

- App container는 store/IPC/window action을 연결한다.
- LauncherView는 MainFrame 안에 dashboard/logs/preferences를 조립한다.
- DashboardView는 Bottle home/detail을 관리한다.
- Logs view는 LogViewer를 사용한다.
- Preferences view는 PreferenceView를 사용한다.

UI 변경 지시 포인트:

- 앱 전체 navigation 구조.
- dashboard/logs/preferences 간 전환 UX.
- Bottle detail을 page로 볼지 panel로 볼지.
- Header와 sidebar의 역할 분리.

유지할 계약:

- View 본체는 가능한 props 기반으로 렌더링한다.
- IPC/store 접근은 App container에서 처리한다.
