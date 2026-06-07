# DashboardBreadcrumb

Source: `src/Renderer/Component/BottleDashboard.tsx`
Story: `src/Renderer/Stories/View/MainView.stories.tsx`

역할:

- Dashboard header title 영역에 표시되는 Bottle Home > Bottle Name breadcrumb.

현재 UI:

- Bottle Home button.
- Bottle이 선택되면 separator와 Bottle name button 표시.
- 둘 다 클릭 가능한 breadcrumb item이다.

주요 props:

- `bottleName`
- `onBottleHome`
- `onBottleClick`

UI 변경 지시 포인트:

- separator 모양.
- home icon 추가 여부.
- active Bottle item hover/selected state.

유지할 계약:

- Home과 Bottle item 모두 interactive해야 한다.
