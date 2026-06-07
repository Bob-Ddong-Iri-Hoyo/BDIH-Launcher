# DashboardView

Source: `src/Renderer/View/MainView/MainView.tsx`
Story: `src/Renderer/Stories/View/MainView.stories.tsx`

역할:

- MainView 안의 dashboard content.
- Bottle home/detail 전환, Bottle context menu, CreateBottleDialog open 상태를 관리한다.

현재 UI 흐름:

- 선택된 Bottle이 없으면 DashboardHomePanel을 렌더링한다.
- Bottle이 선택되면 BottleDetailPanel을 렌더링한다.
- Bottle card 우클릭 시 ContextMenu를 띄운다.
- Create button 클릭 시 CreateBottleDialog를 띄운다.

주요 props:

- wine version 상태.
- install path.
- bottles.
- selectedBottleId.
- wine/bottle action callbacks.

UI 변경 지시 포인트:

- home/detail 전환 방식.
- context menu item 구성.
- CreateBottleDialog 연결.
- InstalledWinePanel open 상태.

유지할 계약:

- DashboardView는 MainFrame 밖의 독립 화면이 아니라 dashboard content다.
