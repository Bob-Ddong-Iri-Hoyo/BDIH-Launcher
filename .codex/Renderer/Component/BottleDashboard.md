# BottleDashboard Components

Source: `src/Renderer/Component/BottleDashboard.tsx`
Story: `src/Renderer/Stories/View/MainView.stories.tsx`

역할:

- Dashboard에 쓰이는 Bottle 관련 UI 조각들을 모아둔 파일.
- 개별 변경은 가능하면 아래 문서를 우선 수정한다.

관련 문서:

- `DashboardBreadcrumb.md`
- `BottleCard.md`
- `DashboardHomePanel.md`
- `BottleDetailPanel.md`
- `CreateBottleDialog.md`

현재 구조:

- Bottle home은 hero, selected wine summary, bottle library, installed wine panel로 구성된다.
- Bottle detail은 bottle metadata, recipe settings panel, apps grid로 구성된다.
- Create dialog는 Bottle 이름, Wine version, path, description을 입력한다.

UI 변경 지시 포인트:

- Bottle home과 detail 간 화면 전환 방식.
- Bottle library density.
- recipe settings panel 위치와 내용.
- Create Bottle dialog field 구성.
