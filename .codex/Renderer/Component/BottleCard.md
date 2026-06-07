# BottleCard

Source: `src/Renderer/Component/BottleDashboard.tsx`
Story: `src/Renderer/Stories/View/MainView.stories.tsx`

역할:

- Bottle home grid에 표시되는 개별 Bottle tile.
- 좌클릭으로 Bottle detail로 진입하고, 우클릭으로 custom context menu를 연다.

현재 UI:

- rounded card button.
- 좌상단 Bottle icon, 우상단 status badge.
- Bottle name, description, app count, wine version id 표시.

주요 props:

- `bottle`: Bottle data.
- `onClick`: Bottle 선택.
- `onContextMenu`: Bottle context menu open.

UI 변경 지시 포인트:

- Bottle thumbnail/image 사용 여부.
- status badge 위치.
- app count와 wine version metadata 표시 방식.
- hover/focus/selected state.

유지할 계약:

- 전체 card는 button이어야 한다.
- 우클릭 context menu 이벤트는 유지한다.
