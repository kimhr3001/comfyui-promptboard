# PromptBoard 태그 패밀리 개발 계획

상태: Phase 2.5 완료

진행 상태:

- 완료: Phase 1 / Schema와 Backend 조합
- 완료: Phase 2 / 최소 UI
- 완료: Phase 2.5 / 다중 target 노출
- 다음: Phase 3 / 첫 YAML 패밀리

## 목적

PromptBoard는 이미 공통 선택 목록을 위한 `tagSets`와, 색상/재질처럼 앞에 붙는 단순 조합을 위한 modifier 구조를 지원한다.

다음 단계는 아래처럼 단부루 스타일의 구조적 태그 묶음을 지원하는 것이다.

```text
grabbing_own_breast
grabbing_another's_hair
arms_up
arms_behind_back
looking_at_viewer
```

이 태그들은 단순한 색상/재질 접두어 조합이 아니다. 작은 태그 문법에서 최종 태그 하나를 생성하는 구조이며, 아직 전체 워크플로우 구조를 바꾸지 않고 현재 긍정 프롬프트 구조 안으로 출력되어야 한다.

## 현재 긍정 프롬프트 구조

현재 `2608_default.json`의 긍정 프롬프트 흐름은 다음과 같다.

```text
PrimitiveStringMultiline "BasePrompt"
  -> PromptBoard source_text
  -> PromptBoard prompt_preview
  -> DPRandomGenerator "BasePrompt"
  -> CLIPTextEncodeWithTokens "Pos 프롬프트 (Token)"
  -> KSampler positive
```

현재 기본 프롬프트 템플릿은 다음 구조다.

```text
masterpiece, best quality, amazing quality, realistic, detailed, newest, <INTER>, <POSE_SET>,

BREAK
<VIEW>

BREAK
## GIRL START ##
[1girl, <GIRL_POS>, <HAIR>]
[<GIRL_FACE>]
[<GIRL_BODY>, <CLOTHES>,]
## GIRL END ##

BREAK
## PARTNER_START ###
[<PARTNER>]
[(<PARTNER_PENIS>:0.9)]
## PARTNER_END ##

BREAK
[<HARD>, <ETC>]

BREAK
<LOCATION>,
```

태그 패밀리의 출력은 먼저 이 기존 placeholder를 대상으로 한다. 메인 캐릭터와 서브 캐릭터를 분리해 프롬프트를 생성하는 미래 구조는 이번 개발 범위에 포함하지 않는다.

## 개발 범위

### 포함

- `_promptboard.tagFamilies` schema 지원 추가
- 기존 `tagSets`를 slot 선택지 소스로 재사용
- pattern과 선택된 slot 값으로 최종 태그 text 하나 생성
- 명시적 허용 목록으로 잘못된 조합 제한
- 생성된 패밀리 태그를 `<GIRL_POS>`, `<GIRL_FACE>`, `<PARTNER>`, `<HARD>`, `<VIEW>` 같은 기존 placeholder로 출력
- PromptBoard UI에서 태그 패밀리 선택 UI 표시
- 선택된 패밀리 상태를 `selected_state`에 저장
- 생성된 태그를 `selection_json`, `preview_text`, `prompt_preview`에 포함

### 제외

- add-on YAML 조합 기능
- 메인 캐릭터 + 복수 서브 캐릭터 프롬프트 생성
- 새로운 `BREAK` 레이아웃 생성
- 외부 단부루 태그 DB와의 자동 검증
- 모든 조합을 기본으로 생성하는 카테시안 곱 방식

## 제안 YAML 구조

```yaml
_promptboard:
  schemaVersion: 2
  tagSets:
    grabOwners:
      label: 잡기 주체
      tags:
        - text: own
          label: 자기
        - text: another's
          label: 상대

    grabTargets:
      label: 잡기 대상
      tags:
        - text: breast
          label: 가슴
        - text: ass
          label: 엉덩이
        - text: hair
          label: 머리카락

  tagFamilies:
    grabbing:
      label: 잡기
      targets:
        girl:
          label: 캐릭터 잡기
          placeholder: <GIRL_POS>
          uiGroup: 캐릭터
        partner:
          label: 파트너 잡기
          placeholder: <PARTNER>
          uiGroup: 파트너
      pattern: "grabbing_{owner}_{target}"
      slots:
        owner:
          label: 주체
          source: grabOwners
        target:
          label: 대상
          source: grabTargets
      allowed:
        - owner: own
          target: breast
        - owner: own
          target: ass
        - owner: another's
          target: hair
        - owner: another's
          target: ass
```

## Schema 규칙

- `tagFamilies`는 `schemaVersion: 2`에서만 유효하다.
- 패밀리 id는 `tagSets`와 같은 식별자 규칙을 사용한다.
  - `^[A-Za-z][A-Za-z0-9_-]*$`
- `label`이 없으면 패밀리 id를 표시명으로 사용한다.
- family는 `placeholder` 또는 `targets` 중 하나를 선언한다.
- `placeholder`는 하위 호환용 단일 target 축약 문법이다.
- `targets`는 같은 family pattern을 여러 placeholder/UI 위치에 노출하기 위한 mapping이다.
- target id는 `tagSets`와 같은 식별자 규칙을 사용한다.
- target의 `placeholder`는 필수이며 기존 placeholder 패턴과 일치해야 한다.
- `pattern`은 필수이며 `{slotId}` 형태의 이름 있는 slot을 포함해야 한다.
- `slots`는 필수다.
- `pattern`에서 참조한 모든 slot id는 `slots`에 존재해야 한다.
- 각 slot은 기존 `tagSet`을 참조하는 `source`를 선언해야 한다.
- `allowed`는 선택 항목이지만 권장한다.
- `allowed`가 있으면 명시된 slot 조합만 선택 가능하다.
- `allowed`가 없으면 런타임에서 모든 조합을 만들 수 있지만, 작고 위험이 낮은 패밀리에만 사용한다.

## 정규화된 모델 구조

```json
{
  "tagFamilies": {
    "grabbing": {
      "label": "잡기",
      "placeholder": "<GIRL_POS>",
      "uiGroup": "캐릭터",
      "targets": {
        "girl": {
          "label": "캐릭터 잡기",
          "placeholder": "<GIRL_POS>",
          "uiGroup": "캐릭터"
        },
        "partner": {
          "label": "파트너 잡기",
          "placeholder": "<PARTNER>",
          "uiGroup": "파트너"
        }
      },
      "pattern": "grabbing_{owner}_{target}",
      "slots": {
        "owner": {
          "label": "주체",
          "source": "grabOwners"
        },
        "target": {
          "label": "대상",
          "source": "grabTargets"
        }
      },
      "allowed": [
        { "owner": "own", "target": "breast" }
      ]
    }
  }
}
```

## 선택 상태 구조

패밀리 선택 상태는 기존 category 선택 상태나 modifier 선택 상태와 분리해서 저장한다.

```json
{
  "$families": {
    "grabbing": {
      "girl": [
        {
          "owner": "own",
          "target": "breast"
        }
      ],
      "partner": [
        {
          "owner": "another's",
          "target": "hair"
        }
      ]
    }
  }
}
```

생성 결과는 다음과 같다.

```text
grabbing_own_breast
grabbing_another's_hair
```

## UI 제안

태그 패밀리는 대상 문맥 아래의 category 비슷한 패널로 표시한다.

예를 들어 `<GIRL_POS>`로 출력되는 패밀리는 `캐릭터 > 포즈` 또는 `캐릭터 > 손` 주변에 배치할 수 있다. 정확한 위치는 패밀리 label과 선택적 UI grouping 규칙으로 결정한다.

최소 UI는 다음과 같다.

```text
잡기
[자기] [상대]
[머리카락] [가슴] [엉덩이]

허용 조합
[자기 + 가슴] [자기 + 엉덩이] [상대 + 머리카락]
```

초기 UI 권장안은 다음과 같다.

- slot 선택기를 바로 만들지 않고, 허용된 최종 조합을 버튼 목록으로 표시한다.
- 버튼에는 slot tag의 `label`을 조합해서 표시한다.
- 실제 생성되는 tag text는 툴팁에 표시한다.
- 모델의 유용성이 확인되기 전까지 복잡한 다단계 slot picker는 피한다.

버튼 표시 예:

```text
자기 / 가슴
```

툴팁 예:

```text
grabbing_own_breast
```

## 런타임 조합

패밀리 선택은 placeholder를 기준으로 가상 선택 항목으로 변환한다.

예:

```json
{
  "$family:grabbing": {
    "placeholder": "<GIRL_POS>",
    "selected": [
      "grabbing_own_breast",
      "grabbing_another's_hair"
    ]
  }
}
```

기존 placeholder 치환 경로는 이 값을 일반 category 값과 함께 YAML 순서 기준으로 추가할 수 있다.

## 제안 Phase 계획

### Phase 1: Schema와 Backend 조합 [완료]

- Python YAML parser와 browser YAML parser에 `_promptboard.tagFamilies` 지원 추가
- 정상/오류 패밀리 정의에 대한 계약 테스트 추가
- `$families` 선택 상태 정규화 추가
- 백엔드에서 선택된 family state를 최종 tag string으로 조합
- 기존 selection payload 경로로 family selection 출력

완료 기준:

- 정상 YAML이 `tagFamilies`를 포함한 형태로 정규화된다.
- 존재하지 않는 tagSet source, pattern slot 누락, 잘못된 allowed 값이 안정적인 오류로 실패한다.
- 백엔드 preview가 올바른 placeholder에 생성 태그를 출력할 수 있다.

완료 결과:

- `_promptboard.tagFamilies`를 Python/browser YAML parser에서 같은 계약으로 정규화한다.
- `$families` 선택 상태를 읽어 `$family:<familyId>` selection payload로 출력한다.
- 같은 placeholder에서는 기존 category 선택값을 먼저 두고, family 생성값을 뒤에 추가한다.
- `allowed`가 있으면 허용된 조합만 출력하고, 허용되지 않은 저장 상태는 warning으로 제거한다.
- `allowed`가 없으면 backend가 전체 조합을 생성하지 않고, 저장된 slot 조합 중 tagSet에 존재하는 값만 조합한다.
- schema 계약 문서와 valid/invalid fixture를 갱신했다.

검증:

- `/Users/rociomini/Downloads/ComfyUI/.venv/bin/python -m unittest discover -s tests -p 'test_promptboard_yaml_backend.py'`
- `node --test tests/test_promptboard_yaml.mjs`
- `node --check web/js/promptboard_yaml.mjs`
- `/Users/rociomini/Downloads/ComfyUI/.venv/bin/python -m py_compile promptboard_yaml.py yaml_tag_nodes.py`

### Phase 2: 최소 UI [완료]

- navigator에 tag family group 표시
- Phase 2에서는 허용된 최종 조합만 버튼으로 표시
- 선택된 조합을 `$families`에 저장
- 선택 요약에 선택된 family tag 표시
- family selection 클릭 시 생성 태그가 toggle된다.

완료 기준:

- 사용자가 UI에서 `grabbing_own_breast`를 선택할 수 있다.
- 선택 결과가 preview와 최종 prompt에 표시된다.
- 기존 category, attribute, modifier 기능이 계속 동작한다.

완료 결과:

- `tagFamilies`를 navigator item으로 표시한다.
- Phase 2에서는 `allowed`에 선언된 최종 조합만 버튼으로 렌더링한다.
- family 선택 상태는 `$families` 아래에 저장하고 template 저장/불러오기 흐름을 그대로 사용한다.
- group filter 카운트, 현재 category clear, 선택 요약, 검색 이동이 family 선택을 인식한다.
- family 버튼은 label 조합을 표시하고, 실제 생성 tag text는 tooltip과 검색 결과에서 확인할 수 있다.
- `allowed`가 없는 family는 UI에서 조합 버튼을 만들지 않고 빈 안내만 표시한다.

검증:

- `node --test tests/test_promptboard_tag_family_state.mjs tests/test_promptboard_yaml.mjs tests/test_promptboard_attribute_state.mjs`
- `/Users/rociomini/Downloads/ComfyUI/.venv/bin/python -m unittest discover -s tests`
- `node --check web/js/yaml_tag_board_split.js`
- `node --check web/js/promptboard_tag_family_state.mjs`
- `node --check web/js/promptboard_yaml.mjs`

### Phase 2.5: 다중 target 노출 [완료]

`grabbing_own_*`, `grabbing_another's_*`처럼 캐릭터와 파트너 양쪽에서 쓸 수 있는 family를 복제하지 않기 위해 `targets` 구조를 추가한다.

- `placeholder` 단일 구조는 하위 호환으로 유지한다.
- `targets` mapping을 선언하면 family pattern과 allowed list는 한 번만 관리하고, target별 `placeholder`, `uiGroup`, `label`만 분리한다.
- 선택 상태는 `$families.<familyId>.<targetId>[]`로 저장한다.
- 기존 `$families.<familyId>[]` 배열은 첫 target 선택으로 마이그레이션한다.
- UI navigator, 그룹 카운트, 검색, 선택 요약, clear는 target별 family item을 따로 다룬다.

완료 기준:

- 같은 family를 `<GIRL_POS>`와 `<PARTNER>`에 동시에 노출할 수 있다.
- 캐릭터 target에서 선택한 조합이 파트너 target에 자동 출력되지 않는다.
- 기존 `placeholder` 단일 family fixture와 저장 상태가 계속 동작한다.

완료 결과:

- Python/browser YAML parser가 `targets`를 정규화하고, legacy `placeholder`를 `default` target으로 변환한다.
- backend selection payload는 다중 target을 `$family:<familyId>:<targetId>`로 출력하고, `default` target은 기존 `$family:<familyId>` key를 유지한다.
- UI는 family target을 navigator item 단위로 렌더링한다.

검증:

- `node --test tests/test_promptboard_tag_family_state.mjs tests/test_promptboard_yaml.mjs tests/test_promptboard_attribute_state.mjs`
- `/Users/rociomini/Downloads/ComfyUI/.venv/bin/python -m unittest discover -s tests -p 'test_promptboard_yaml_backend.py'`
- `/Users/rociomini/Downloads/ComfyUI/.venv/bin/python -m unittest discover -s tests -p 'test_yaml_schema_contract.py'`
- `node --check web/js/yaml_tag_board_split.js`
- `node --check web/js/promptboard_tag_family_state.mjs`
- `node --check web/js/promptboard_yaml.mjs`

### Phase 3: 첫 YAML 패밀리

현재 placeholder 구조와 잘 맞는 작은 집합부터 시작한다.

- 캐릭터 손/몸 동작
  - `grabbing_own_{target}` -> `<GIRL_POS>` 또는 `<GIRL_BODY>`
  - `spreading_own_{target}` -> `<GIRL_POS>`
- 파트너 동작
  - `grabbing_another's_{target}` -> `<PARTNER>`
  - `foot_on_another's_{target}` -> `<PARTNER>`
- 시선 방향
  - `looking_{direction}` -> `<GIRL_FACE>`
- 팔 자세
  - `arms_{position}` -> `<GIRL_POS>`

완료 기준:

- 확신도가 높은 allowed 조합만 소량 추가한다.
- 큰 카테시안 곱 확장은 하지 않는다.
- 이 Phase에서는 기존 명시 태그를 제거하지 않는다.

### Phase 4: 정리 후보 검토

패밀리가 실제로 쓸 만하다고 확인된 뒤 정리를 진행한다.

- family output과 중복되는 기존 category tag를 식별한다.
- 생성 결과와 기존 선택 동작을 비교한 뒤에만 이동 또는 제거한다.
- family 문법으로 만들면 오히려 찾기 어려운 고가치 단독 단부루 태그는 유지한다.

완료 기준:

- 기존 template의 prompt output 회귀가 없다.
- 제거한 태그에는 문서화된 generated replacement가 있다.

## 리스크

- 단부루 태그처럼 보이지만 실제로는 잘못된 태그를 과도하게 생성할 수 있다.
- 현재 태그 버튼 모델보다 UI가 복잡해질 수 있다.
- 명시 태그를 너무 빨리 제거하면 검색성과 발견성이 떨어질 수 있다.
- 캐릭터 동작과 파트너 동작이 잘못된 `BREAK` 영역으로 섞일 수 있다.

## 권장 방향

태그 패밀리는 범용 카테시안 곱 생성기가 아니라 제한된 태그 생성기로 만든다.

현재 긍정 프롬프트 placeholder를 출력 경계로 사용한다. 이렇게 하면 지금 구조 안에서 바로 유용하게 쓸 수 있고, 이후 캐릭터 slot 기반 프롬프트 생성 구조로 확장할 길도 남길 수 있다.

## 문서 리뷰 결과

현재 방향은 대체로 적절하다. 특히 범용 조합 생성기가 아니라 `allowed` 기반의 제한된 생성기로 시작하는 판단이 좋다. 지금 YAML은 이미 태그 수가 많고 의미가 비슷한 태그가 계속 늘어나는 구조라, 손/파트너 동작/시선처럼 패턴이 분명한 영역부터 구조화하면 관리 부담을 줄일 수 있다.

개발 전 보강하면 좋은 지점은 다음과 같다.

- `_promptboard`의 허용 필드 목록에 `tagFamilies`를 추가해야 하므로, 구현 시 [yaml-schema-v2-contract.md](/Users/rociomini/Downloads/ComfyUI/custom_nodes/comfyui-promptboard/docs/yaml-schema-v2-contract.md)도 함께 갱신해야 한다.
- `$families`는 기존 category 이름과 충돌하지 않는 예약 key로 취급해야 한다. 사용자가 YAML category 이름을 `$families`로 만들었을 때 어떻게 막을지 schema 규칙에 포함하는 것이 좋다.
- 같은 placeholder에 일반 category tag와 family tag가 같이 들어갈 때 출력 순서를 명확히 해야 한다. 현재 문서의 "YAML 순서 기준" 방향은 좋지만, category와 family가 서로 다른 tree에 있을 때 어느 쪽을 먼저 둘지 구현 전에 고정해야 한다.
- `allowed`가 없는 전체 조합 생성은 가능하다고 열어두되, 초기 구현에서는 비활성화하거나 작은 최대 조합 수 제한을 두는 편이 안전하다.
- 첫 UI는 slot을 단계별로 고르는 방식보다 "허용된 최종 조합 버튼" 방식이 맞다. 사용자는 `owner`, `target` 같은 내부 구조보다 실제 선택 결과를 먼저 이해하기 때문이다.
- Phase 3에서 기존 명시 태그를 제거하지 않는 결정은 유지하는 것이 좋다. 구조화가 실제로 검색성과 선택 속도를 개선하는지 확인하기 전에는 제거보다 병행이 안전하다.
- `another's`처럼 apostrophe가 들어간 값, `looking_at_viewer`처럼 이미 밑줄을 포함한 값, 여러 단어가 결합된 값은 pattern 치환 테스트에 반드시 포함해야 한다.

결론적으로, 이 문서는 다음 개발의 기준으로 사용해도 된다. 다만 Phase 1을 시작하기 전에 예약 key, 출력 순서, 전체 조합 제한 정책 세 가지를 먼저 문서에 확정하면 구현 중 흔들릴 가능성이 줄어든다.
