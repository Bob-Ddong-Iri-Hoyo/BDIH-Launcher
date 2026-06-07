# BottleDetailPanel

Source: `src/Renderer/Component/BottleDashboard.tsx`
Story: `src/Renderer/Stories/View/MainView.stories.tsx`

역할:

- 사용자가 Bottle을 클릭했을 때 표시되는 Bottle detail 화면.

현재 UI:

- 상단에 status, Bottle name, description, back button.
- selected wine, bottle path metadata panel.
- 우측 recipe settings panel.
- 하단에 Bottle 안의 game/app grid.

주요 props:

- `bottle`: 선택된 Bottle.
- `selectedWineVersionId`: 현재 선택된 Wine version.
- `appLogoSrc`: app tile 기본 이미지.
- `onBottleHome`: home으로 돌아가기.

UI 변경 지시 포인트:

- detail 화면을 더 독립적인 page처럼 보이게 할지.
- recipe settings를 modal/panel/sidebar 중 어디에 둘지.
- Bottle apps grid density와 action button.

유지할 계약:

- back/home으로 나가는 동작은 유지한다.
- Bottle apps는 `bottle.apps`를 기준으로 렌더링한다.
