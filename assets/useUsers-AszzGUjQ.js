import{u}from"./query-AElufN0_.js";import{u as i}from"./create-user.schema-CH692LcI.js";import{u as o}from"./users.sdk-DHU9_zPk.js";function a(s,r=!0){return u({queryKey:i.list(s),queryFn:()=>o.list(s),staleTime:15e3,enabled:r})}function l(s){const{data:r,...e}=a();return{...e,data:s?r?.find(t=>t.id===s):void 0}}export{l as a,a as u};
//# sourceMappingURL=useUsers-AszzGUjQ.js.map
