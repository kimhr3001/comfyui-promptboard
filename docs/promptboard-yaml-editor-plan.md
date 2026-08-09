# PromptBoard YAML Editor 개발 계획

## 목적

`PromptBoard`는 생성 중 태그를 선택하고 prompt preview/replace 결과를 확인하는 노드로 유지한다.

YAML 작성, 수정, 검증, 저장, 섹션/태그 추가는 별도 `PromptBoard YAML Editor` 노드로 분리한다. 이 분리는 `PromptBoard` 본체의 UI 복잡도를 줄이고, YAML 관리 작업을 안전한 편집 흐름으로 격리하기 위한 것이다.

## 핵심 원칙

- `PromptBoard`는 YAML을 사용한다.
- `PromptBoard YAML Editor`는 YAML을 편집한다.
- YAML 선택창은 양쪽에 둔다.
- 두 노드의 YAML 선택 상태는 자동 동기화하지 않는다.
- 기존 템플릿 계약은 유지한다.
- `yaml_text` hidden widget은 MVP 단계에서 제거하지 않는다.

## 역할 분리

### PromptBoard

`PromptBoard`는 생성용 UI다.

유지할 기능:

- YAML 선택
- YAML reload
- 템플릿 선택/저장/삭제
- 보드 검색
- reset
- 그룹 필터
- 태그 선택
- `selection_json`, `preview_text`, `prompt_preview`, `replace_report` 출력

제거하거나 축소할 기능:

- YAML 원문 편집
- YAML 원문 검색
- `Save YAML`
- YAML fold 상태 관리 UI

내부적으로 유지할 값:

- `yaml_file`
- `yaml_text`
- `selected_state`

### PromptBoard YAML Editor

`PromptBoard YAML Editor`는 관리용 UI다.

담당할 기능:

- YAML 선택
- YAML 원문 로드
- YAML 원문 편집
- schema validation
- 저장 전 백업
- YAML 저장
- 섹션 추가
- 태그 추가
- 중복 경고

Editor에서 저장해도 `PromptBoard`의 선택 YAML이나 선택 상태는 자동 변경하지 않는다. `PromptBoard`는 사용자가 `Reload YAML`을 누르거나 YAML을 다시 선택했을 때 변경된 파일을 읽는다.

## 템플릿 영향 범위

현재 템플릿은 YAML 원문을 저장하지 않는다.

템플릿 저장 계약:

```json
{
  "name": "template name",
  "yaml_file": "default.yaml",
  "selected_state": {}
}
```

따라서 YAML Editor 분리 후에도 템플릿 구조는 유지한다.

템플릿 동작 원칙:

- 템플릿 저장 시 `yaml_file`과 `selected_state`만 저장한다.
- 템플릿 로드 시 `yaml_file` 기준으로 YAML 원문을 다시 읽는다.
- 읽은 YAML 원문을 `PromptBoard`의 hidden `yaml_text`에 동기화한다.
- 저장된 `selected_state`는 현재 YAML 기준으로 prune/migration한다.
- Editor의 YAML 선택 상태는 템플릿과 자동 연결하지 않는다.

사이드 이펙트 방지:

- `yaml_text` widget 순서와 workflow 직렬화는 MVP에서 유지한다.
- 기존 workflow 로드 호환성을 깨지 않는다.
- YAML 파일 변경 후 기존 선택 상태에 없는 태그는 기존 로직처럼 제거한다.
- attribute board migration 동작을 유지한다.

## MVP 범위

MVP의 목표는 "분리된 YAML 편집 노드가 실사용 가능한가"를 검증하는 것이다. 삭제, 이동, rename처럼 복잡한 편집 기능은 MVP에서 제외한다.

### MVP 기능

#### 1. PromptBoard UI 재배치

`PromptBoard`에 남길 UI:

- YAML 선택창
- `Reload YAML`
- 템플릿 선택
- 템플릿 이름 입력
- `Save` / `Save (New)` / `Delete`
- 보드 검색
- reset
- 그룹 필터
- 태그 보드

`PromptBoard`에서 제거하거나 기본 숨김 처리할 UI:

- YAML 원문 에디터
- YAML 원문 검색
- `Save YAML`

YAML 선택 변경 시 처리:

1. `yaml_file` widget 값을 갱신한다.
2. `/promptboard/yaml/file?name=...`로 YAML 원문을 읽는다.
3. hidden `yaml_text`를 갱신한다.
4. 보드를 재렌더링한다.
5. 선택 상태를 현재 YAML 기준으로 정리한다.
6. 현재 선택 템플릿은 해제한다.

#### 2. PromptBoard YAML Editor 노드 추가

노드명:

```text
PromptBoard YAML Editor
```

초기 입력/상태:

- `yaml_file`
- `yaml_text`

초기 출력:

- `yaml_file`
- `validation_report`
- `save_report`

초기 UI:

- YAML 선택창
- YAML 원문 에디터
- validation 상태
- `Validate`
- `Save YAML`
- `+ Section`
- `+ Tag`

#### 3. YAML 저장 정책

저장은 Editor 노드에서 담당한다.

필수 정책:

- 저장 전 `normalize_yaml_document` 실행
- 저장 전 자동 백업 생성
- YAML parse/schema error 발생 시 저장 차단
- path traversal 차단
- `.yaml` / `.yml` 확장자만 허용
- 저장 실패 시 원본 유지

백업 파일명 예:

```text
default.yaml.bak-20260809-153012
```

#### 4. 섹션/태그 추가

팝업 기반으로 추가한다.

공통 입력:

- 대상 YAML
- 대상 카테고리
- 추가 위치
  - 카테고리 하단
  - 선택 섹션 하단
- 추가 타입
  - 섹션
  - 태그

섹션 추가 입력:

- `section` label

태그 추가 입력:

- `text`
- `label`
- `description`
- `default`

MVP 정책:

- 중복 `text`는 차단하거나 강한 경고를 표시한다.
- 같은 카테고리 내 중복 `label`은 경고한다.
- 저장 전 validation을 반드시 통과해야 한다.
- 삭제/이동/rename은 구현하지 않는다.

#### 5. API

기존 유지:

- `GET /promptboard/yaml/files`
- `GET /promptboard/yaml/file?name=...`
- `POST /promptboard/yaml/file`
- `GET /promptboard/templates`
- `GET /promptboard/template`
- `POST /promptboard/template`
- `DELETE /promptboard/template`

MVP 추가 후보:

- `POST /promptboard/yaml/validate`
- `POST /promptboard/yaml/backup`

`POST /promptboard/yaml/insert`는 MVP에서 필수는 아니다. 1차에서는 프론트에서 YAML text를 수정한 뒤 기존 save API로 저장할 수 있다.

### MVP 제외 범위

- 태그 삭제
- 태그 이동
- 섹션 이동
- category 추가/삭제
- tag set 편집
- attribute board 편집
- YAML 주석 보존 보장
- workflow migration
- `yaml_text` widget 제거
- PromptBoard와 Editor의 YAML 선택 자동 동기화

### MVP 완료 기준

- `PromptBoard`와 `PromptBoard YAML Editor` 양쪽에 YAML 선택창이 있다.
- 두 YAML 선택 상태는 독립이다.
- Editor에서 YAML을 저장할 수 있다.
- 저장 전 백업이 생성된다.
- invalid YAML은 저장되지 않는다.
- PromptBoard에서 같은 YAML을 reload하면 Editor 저장 내용이 반영된다.
- 기존 템플릿 저장/로드가 유지된다.
- 기존 workflow가 열리고 선택 상태가 복원된다.
- PromptBoard에서 YAML 원문 편집 UI가 제거되거나 기본 숨김 처리된다.

### MVP 검증

Python:

- YAML file list 조회
- YAML read/write
- invalid YAML 저장 차단
- backup 생성
- template save/load 기존 계약 유지
- selected state prune/migration 유지

JavaScript:

- PromptBoard YAML 선택 시 hidden `yaml_text` 갱신
- PromptBoard `Reload YAML` 동작
- PromptBoard template save/load 유지
- Editor YAML 선택 시 원문 로드
- Editor save 성공/실패 상태 표시
- section/tag insert 후 normalize 가능
- 두 노드 YAML 선택 상태 독립

수동 회귀:

- 기존 workflow 열기
- 기존 template 자동 복원
- 기존 preview/replace 출력
- attributeBoards 선택 상태 유지
- 모바일/좁은 화면에서 PromptBoard UI 확인

## 고도화 범위

고도화는 MVP 안정화 이후 진행한다. 목표는 YAML 관리 품질을 높이고, 대규모 태그 파일을 안전하게 유지보수할 수 있게 만드는 것이다.

### 1. 구조 편집 확장

추가 후보:

- 태그 삭제
- 태그 rename
- 태그 이동
- 섹션 이동
- 섹션 rename
- 카테고리 추가
- 카테고리 이동
- 카테고리 rename
- tag set 편집
- attribute board 편집

주의:

- rename은 기존 템플릿의 `selected_state`와 연결된다.
- `text` rename은 기존 선택 상태를 깨뜨릴 수 있으므로 migration 또는 명시 경고가 필요하다.
- 삭제는 템플릿에서 해당 선택이 사라지는 사이드 이펙트를 UI에 표시해야 한다.

### 2. Diff 기반 저장

저장 전 변경 내용을 보여준다.

기능:

- 저장 전 diff preview
- 변경된 카테고리/섹션/태그 요약
- 삭제 또는 rename으로 인해 영향 받는 템플릿 목록 표시
- 저장 전 확인 단계

### 3. 템플릿 영향 분석

YAML 변경이 템플릿에 미치는 영향을 분석한다.

분석 대상:

- 삭제될 `text`를 참조하는 템플릿
- rename될 `text`를 참조하는 템플릿
- 사라진 category를 참조하는 템플릿
- attribute board migration 대상

출력 예:

```text
3 templates reference removed tags:
- portrait-base: STYLE.cinematic
- photo-soft: LIGHT.soft light
```

### 4. PromptBoard와 Editor 명시 동기화

자동 동기화는 하지 않는다. 대신 명시 동기화 기능을 검토한다.

후보:

- Editor에서 저장 후 "선택한 PromptBoard에 적용"
- PromptBoard에서 "Open this YAML in Editor"
- PromptBoard에서 "Reload all boards using this YAML"

원칙:

- 사용자가 명시적으로 누른 경우에만 반영한다.
- workflow 안에 여러 PromptBoard가 있을 수 있음을 전제로 한다.
- 템플릿 선택 상태를 임의로 바꾸지 않는다.

### 5. YAML 포맷 보존 개선

MVP에서는 주석/원래 포맷 보존을 보장하지 않는다.

고도화 후보:

- 가능한 범위의 기존 indentation 유지
- section/tag 삽입 시 주변 스타일 유지
- 주석 보존 가능한 parser 검토
- 저장 formatter 옵션 제공

주의:

- 포맷 보존을 완벽하게 보장하려 하면 구현 난도가 크게 오른다.
- schema 안정성과 저장 안전성이 포맷 보존보다 우선이다.

### 6. 검색/탐색 고도화

Editor 노드에서 제공할 수 있는 기능:

- YAML 원문 검색
- tag text 검색
- label 검색
- description 검색
- 중복 text 목록
- 중복 label 목록
- 미사용 placeholder 목록
- category별 태그 개수

PromptBoard에서는 생성용 검색만 유지한다.

### 7. 백업/복원 관리

기능 후보:

- 백업 목록 보기
- 백업 diff 보기
- 백업에서 복원
- 오래된 백업 정리
- 저장 시 변경 요약 기록

### 8. `yaml_text` 계약 정리

MVP 안정화 후 별도 migration으로 검토한다.

검토 대상:

- PromptBoard workflow 저장값에서 `yaml_text` 제거 가능 여부
- 기존 workflow migration 필요 여부
- `yaml_file`만으로 재현 가능한지
- inline YAML 지원을 유지할지 제거할지

권장:

- MVP에서는 제거하지 않는다.
- 제거한다면 별도 major 변경으로 취급한다.

## 진행 상태

- 완료: Phase 1 / Step 1 - YAML backup/validate backend helper 추가
  - 결과: `/promptboard/yaml/validate`, `/promptboard/yaml/backup` API와 helper를 추가했다.
  - 검증: `tests/test_promptboard_yaml_backend.py`, `tests/test_promptboard_cache.py`, JS syntax/test, Python compile, `git diff --check`
  - 다음 작업: Phase 1 / Step 2 - `PromptBoard YAML Editor` 노드 skeleton 추가
- 완료: Phase 1 / Step 2 - `PromptBoard YAML Editor` 노드 skeleton 추가
  - 결과: validation report와 save report 출력을 가진 최소 노드를 등록했다.
  - 검증: `tests/test_promptboard_yaml_backend.py`, Python compile, `git diff --check`
  - 다음 작업: Phase 1 / Step 3 - Editor YAML 선택/로드 구현
- 완료: Phase 1 / Step 3 - Editor YAML 선택/로드 구현
  - 결과: Editor 노드 전용 DOM UI에서 YAML 파일 선택, 서버 원문 로드, hidden `yaml_text` 동기화를 구현했다.
  - 검증: JS syntax, backend tests, Python compile, `git diff --check`
  - 다음 작업: Phase 1 / Step 4 - Editor 저장/백업/검증 구현
- 완료: Phase 1 / Step 4 - Editor 저장/백업/검증 구현
  - 결과: Editor UI에 validate/save 동작을 추가하고 저장 전 backup을 강제했다.
  - 검증: JS syntax, backend tests, Python compile, `git diff --check`
  - 다음 작업: Phase 1 / Step 5 - 섹션/태그 추가 팝업 구현

## 단계별 구현 순서

### Phase 1: MVP 기반

1. [완료] YAML backup/validate backend helper 추가
2. [완료] `PromptBoard YAML Editor` 노드 skeleton 추가
3. [완료] Editor YAML 선택/로드 구현
4. [완료] Editor 저장/백업/검증 구현
5. 섹션/태그 추가 팝업 구현
6. PromptBoard YAML 선택창을 보드 컨트롤 영역으로 이동
7. PromptBoard YAML 원문 편집 UI 제거 또는 기본 숨김
8. `Reload YAML` 추가
9. 템플릿 회귀 테스트
10. README 업데이트

### Phase 2: 관리 기능 확장

1. diff preview 추가
2. 중복/품질 경고 강화
3. 백업 목록/복원 추가
4. PromptBoard와 Editor의 명시 동기화 버튼 검토
5. 템플릿 영향 분석 추가

### Phase 3: 계약 정리

1. `yaml_text` hidden widget 유지 필요성 재평가
2. workflow migration 설계
3. inline YAML 정책 결정
4. PromptBoard YAML 관련 legacy UI 제거

## 주요 리스크

- `yaml_text`를 너무 빨리 제거하면 기존 workflow 로딩이 깨질 수 있다.
- Editor 저장 후 PromptBoard 자동 반영을 넣으면 여러 PromptBoard가 있는 workflow에서 의도치 않은 변경이 발생할 수 있다.
- 태그 rename/delete는 기존 템플릿 선택 상태를 깨뜨릴 수 있다.
- YAML 주석/포맷 보존을 MVP에 포함하면 구현 범위가 커진다.
- PromptBoard에서 YAML 원문 검색 기능을 제거하면 기존 사용자의 탐색 흐름이 바뀐다.

## 최종 판단

MVP에서는 `PromptBoard`의 생성 경험을 단순화하고, YAML 편집 책임을 `PromptBoard YAML Editor`로 분리한다.

단, 기존 템플릿과 workflow 호환성을 위해 내부 `yaml_text` 계약은 유지한다. 고도화 단계에서만 workflow migration과 `yaml_text` 제거 여부를 검토한다.
