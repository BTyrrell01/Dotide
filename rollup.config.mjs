import resolve from "@rollup/plugin-node-resolve";
import serve from 'rollup-plugin-serve'
//import commonjs from "@rollup/plugin-commonjs";
//import wasm from "@rollup/plugin-wasm";

export default {
    input:['src/main.js','src/editor.js'],
    output: {
        dir:'dist',
        format:'esm',
        name:'editor'
    },
    plugins:[
        resolve(),
//        commonjs(),
//        wasm(),
        serve('dist') // Serves files from the 'dist' folder
    ]
};
